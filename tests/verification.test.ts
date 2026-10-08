import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import {
  saveCounts,
  approveOrder,
  rejectOrder,
} from "@/lib/services/verificationService";
import { POST as approveRouteHandler } from "@/app/api/verify/[id]/approve/route";
import { POST as rejectRouteHandler } from "@/app/api/verify/[id]/reject/route";
import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";

let currentMockUser: SessionUser | null = null;

// Mock RBAC to control session role in route handlers
vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async (allowedRoles: readonly UserRole[]) => {
    if (!currentMockUser) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    if (!allowedRoles.includes(currentMockUser.role)) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    return { ok: true, user: currentMockUser };
  }),
}));

describe("PART H: Verification Integration Tests (tests/verification.test.ts)", () => {
  let verifierUser: { id: string; email: string };
  let supervisorUser: { id: string; email: string };
  let sewingUser: { id: string; email: string };
  let testRecipe: { id: string; components: Array<{ id: string; componentName: string; piecesPerGarment: number }> };
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    // 1. Fetch or create test users
    let verifier = await prisma.user.findFirst({
      where: { role: "cutting_verifier" },
    });
    if (!verifier) {
      verifier = await prisma.user.create({
        data: {
          email: "verifier@apparelflow.test",
          passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF",
          role: "cutting_verifier",
          fullName: "Cutting Verifier",
        },
      });
    }
    verifierUser = { id: verifier.id, email: verifier.email };

    let supervisor = await prisma.user.findFirst({
      where: { role: "cutting_supervisor" },
    });
    if (!supervisor) {
      supervisor = await prisma.user.create({
        data: {
          email: "supervisor@apparelflow.test",
          passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF",
          role: "cutting_supervisor",
          fullName: "Cutting Supervisor",
        },
      });
    }
    supervisorUser = { id: supervisor.id, email: supervisor.email };

    let sewing = await prisma.user.findFirst({
      where: { role: "sewing_supervisor" },
    });
    if (!sewing) {
      sewing = await prisma.user.create({
        data: {
          email: "sewing@apparelflow.test",
          passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF",
          role: "sewing_supervisor",
          fullName: "Sewing Supervisor",
        },
      });
    }
    sewingUser = { id: sewing.id, email: sewing.email };

    // 2. Fetch or create recipe with components
    let recipe = await prisma.recipe.findFirst({
      include: { components: true },
    });

    if (!recipe || recipe.components.length === 0) {
      recipe = await prisma.recipe.create({
        data: {
          recipeCode: "RCP-TSHIRT-01",
          name: "Standard Crewneck T-Shirt",
          category: "Tops",
          stdFabricYards: 35.5,
          wastageCap: 5.0,
          components: {
            create: [
              { componentName: "Front Panel", piecesPerGarment: 1 },
              { componentName: "Back Panel", piecesPerGarment: 1 },
              { componentName: "Sleeves", piecesPerGarment: 2 },
              { componentName: "Collar Rib", piecesPerGarment: 1 },
            ],
          },
        },
        include: { components: true },
      });
    }

    testRecipe = recipe;
  });

  afterAll(async () => {
    // Cleanup created rows after tests
    if (createdOrderIds.length > 0) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "verification_logs" DISABLE TRIGGER verification_logs_immutable_trigger;`
      );
      try {
        await prisma.verificationLog.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prisma.verificationItem.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prisma.cuttingOrder.deleteMany({
          where: { id: { in: createdOrderIds } },
        });
      } finally {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "verification_logs" ENABLE TRIGGER verification_logs_immutable_trigger;`
        );
      }
    }
    await prisma.$disconnect();
  });

  async function createTestOrderInPendingVerification(targetQty = 10, actualFabricYds = 360) {
    const orderNo = `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const order = await prisma.cuttingOrder.create({
      data: {
        orderNo,
        recipeId: testRecipe.id,
        targetQty,
        fabricRollId: "ROLL-INT-TEST",
        actualFabricYds,
        status: "PENDING_VERIFICATION",
        createdById: supervisorUser.id,
        verificationItems: {
          create: testRecipe.components.map((component) => ({
            componentId: component.id,
            expectedQty: component.piecesPerGarment * targetQty,
            actualQty: null,
            status: null,
          })),
        },
      },
      include: { verificationItems: { include: { component: true } } },
    });

    createdOrderIds.push(order.id);
    return order;
  }

  // Test 1: all GREEN (and a YELLOW case) is approved by cutting_verifier; order becomes VERIFIED; a log row has verifierId, wastagePct, timestamp.
  describe("Test 1: Approval with all GREEN and a YELLOW case", () => {
    it("all GREEN components approved by cutting_verifier -> order becomes VERIFIED and log row has verifierId, wastagePct, timestamp", async () => {
      const order = await createTestOrderInPendingVerification(10, 360);

      // Save counts matching exact expected quantities -> all GREEN
      const counts = order.verificationItems.map((item) => ({
        componentId: item.componentId,
        actualQty: item.expectedQty,
      }));

      const saveRes = await saveCounts(order.id, { counts });
      expect(saveRes.ok).toBe(true);
      if (saveRes.ok) {
        expect(saveRes.approval.canApprove).toBe(true);
        expect(saveRes.items.every((i) => i.status === "GREEN")).toBe(true);
      }

      // Approve order via service function as cutting_verifier
      const approveRes = await approveOrder(order.id, verifierUser.id);
      expect(approveRes.ok).toBe(true);
      if (approveRes.ok) {
        expect(approveRes.order.status).toBe("VERIFIED");
        expect(approveRes.wastagePct).toBeCloseTo(1.4085, 2);
      }

      // Verify DB order state
      const dbOrder = await prisma.cuttingOrder.findUnique({
        where: { id: order.id },
      });
      expect(dbOrder?.status).toBe("VERIFIED");

      // Verify DB verification_logs row
      const logs = await prisma.verificationLog.findMany({
        where: { orderId: order.id },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].verifierId).toBe(verifierUser.id);
      expect(logs[0].decision).toBe("APPROVED");
      expect(Number(logs[0].wastagePct)).toBeCloseTo(1.4085, 2);
      expect(logs[0].timestamp).toBeInstanceOf(Date);
      expect(logs[0].rejectionNote).toBeNull();
    });

    it("YELLOW case (actual > expected) approved by cutting_verifier -> order becomes VERIFIED and log row is recorded", async () => {
      const order = await createTestOrderInPendingVerification(10, 360);

      // Save counts with one YELLOW component (actual > expected) and remaining GREEN
      const counts = order.verificationItems.map((item, index) => ({
        componentId: item.componentId,
        actualQty: index === 0 ? item.expectedQty + 2 : item.expectedQty,
      }));

      const saveRes = await saveCounts(order.id, { counts });
      expect(saveRes.ok).toBe(true);
      if (saveRes.ok) {
        expect(saveRes.approval.canApprove).toBe(true);
        expect(saveRes.items.some((i) => i.status === "YELLOW")).toBe(true);
      }

      // Route handler approval test with mocked session
      currentMockUser = { id: verifierUser.id, role: "cutting_verifier" };
      const req = new Request(`http://localhost/api/verify/${order.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const routeRes = await approveRouteHandler(req, {
        params: Promise.resolve({ id: order.id }),
      });
      expect(routeRes.status).toBe(200);
      const json = await routeRes.json();
      expect(json.ok).toBe(true);
      expect(json.order.status).toBe("VERIFIED");

      // Verify DB order status
      const dbOrder = await prisma.cuttingOrder.findUnique({
        where: { id: order.id },
      });
      expect(dbOrder?.status).toBe("VERIFIED");

      // Verify DB log row
      const logs = await prisma.verificationLog.findMany({
        where: { orderId: order.id },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].verifierId).toBe(verifierUser.id);
      expect(logs[0].decision).toBe("APPROVED");
      expect(Number(logs[0].wastagePct)).toBeDefined();
      expect(logs[0].timestamp).toBeInstanceOf(Date);
    });
  });

  // Test 2: one RED component returns 422 and order stays PENDING_VERIFICATION with no log row.
  describe("Test 2: Rejection of approval when one component is RED", () => {
    it("one RED component returns 422 and order stays PENDING_VERIFICATION with no log row", async () => {
      const order = await createTestOrderInPendingVerification(10, 360);

      // Save counts with one RED component (actual < expected)
      const counts = order.verificationItems.map((item, index) => ({
        componentId: item.componentId,
        actualQty: index === 0 ? item.expectedQty - 1 : item.expectedQty,
      }));

      const saveRes = await saveCounts(order.id, { counts });
      expect(saveRes.ok).toBe(true);
      if (saveRes.ok) {
        expect(saveRes.approval.canApprove).toBe(false);
      }

      // Attempt approval via service function
      const approveRes = await approveOrder(order.id, verifierUser.id);
      expect(approveRes.ok).toBe(false);
      if (!approveRes.ok) {
        expect(approveRes.status).toBe(422);
      }

      // Attempt approval via route handler
      currentMockUser = { id: verifierUser.id, role: "cutting_verifier" };
      const req = new Request(`http://localhost/api/verify/${order.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const routeRes = await approveRouteHandler(req, {
        params: Promise.resolve({ id: order.id }),
      });
      expect(routeRes.status).toBe(422);

      // Assert order in DB stays PENDING_VERIFICATION
      const dbOrder = await prisma.cuttingOrder.findUnique({
        where: { id: order.id },
      });
      expect(dbOrder?.status).toBe("PENDING_VERIFICATION");

      // Assert no verification_logs row was created
      const logs = await prisma.verificationLog.findMany({
        where: { orderId: order.id },
      });
      expect(logs).toHaveLength(0);
    });
  });

  // Test 2b: uncounted component also returns 422.
  describe("Test 2b: Uncounted component returns 422", () => {
    it("uncounted component also returns 422 and leaves order in PENDING_VERIFICATION with no log row", async () => {
      const order = await createTestOrderInPendingVerification(10, 360);

      // Only count one component, leaving other components uncounted (actualQty: null)
      const partialCounts = [
        {
          componentId: order.verificationItems[0].componentId,
          actualQty: order.verificationItems[0].expectedQty,
        },
      ];

      const saveRes = await saveCounts(order.id, { counts: partialCounts });
      expect(saveRes.ok).toBe(true);
      if (saveRes.ok) {
        expect(saveRes.approval.canApprove).toBe(false);
      }

      // Attempt approval via service function
      const approveRes = await approveOrder(order.id, verifierUser.id);
      expect(approveRes.ok).toBe(false);
      if (!approveRes.ok) {
        expect(approveRes.status).toBe(422);
      }

      // Attempt approval via route handler
      currentMockUser = { id: verifierUser.id, role: "cutting_verifier" };
      const req = new Request(`http://localhost/api/verify/${order.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const routeRes = await approveRouteHandler(req, {
        params: Promise.resolve({ id: order.id }),
      });
      expect(routeRes.status).toBe(422);

      // Assert order stays PENDING_VERIFICATION and no log row exists
      const dbOrder = await prisma.cuttingOrder.findUnique({
        where: { id: order.id },
      });
      expect(dbOrder?.status).toBe("PENDING_VERIFICATION");

      const logs = await prisma.verificationLog.findMany({
        where: { orderId: order.id },
      });
      expect(logs).toHaveLength(0);
    });
  });

  // Test 3: reject with empty or whitespace note fails validation; no status change.
  describe("Test 3: Reject validation with empty or whitespace note", () => {
    it("reject with empty or whitespace note fails validation; no status change", async () => {
      const order = await createTestOrderInPendingVerification(10, 360);

      currentMockUser = { id: verifierUser.id, role: "cutting_verifier" };

      // Case A: empty string note
      const emptyReq = new Request(`http://localhost/api/verify/${order.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "" }),
      });

      const emptyRes = await rejectRouteHandler(emptyReq, {
        params: Promise.resolve({ id: order.id }),
      });
      expect(emptyRes.status).toBe(422);
      const emptyJson = await emptyRes.json();
      expect(emptyJson.errors).toBeDefined();

      // Case B: whitespace-only note
      const wsReq = new Request(`http://localhost/api/verify/${order.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "     " }),
      });

      const wsRes = await rejectRouteHandler(wsReq, {
        params: Promise.resolve({ id: order.id }),
      });
      expect(wsRes.status).toBe(422);
      const wsJson = await wsRes.json();
      expect(wsJson.errors).toBeDefined();

      // Case C: note shorter than minimum 5 chars
      const shortReq = new Request(`http://localhost/api/verify/${order.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "bad" }),
      });

      const shortRes = await rejectRouteHandler(shortReq, {
        params: Promise.resolve({ id: order.id }),
      });
      expect(shortRes.status).toBe(422);

      // Verify order status in DB has NOT changed and no log row was created
      const dbOrder = await prisma.cuttingOrder.findUnique({
        where: { id: order.id },
      });
      expect(dbOrder?.status).toBe("PENDING_VERIFICATION");

      const logs = await prisma.verificationLog.findMany({
        where: { orderId: order.id },
      });
      expect(logs).toHaveLength(0);
    });
  });

  // Test 4: cutting_supervisor and sewing_supervisor calling approve get 403.
  describe("Test 4: RBAC Forbidden (403) for non-verifiers calling approve", () => {
    it("cutting_supervisor and sewing_supervisor calling approve get 403", async () => {
      const order = await createTestOrderInPendingVerification(10, 360);

      // 1. cutting_supervisor -> 403
      currentMockUser = { id: supervisorUser.id, role: "cutting_supervisor" };

      const supReq = new Request(`http://localhost/api/verify/${order.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const supRes = await approveRouteHandler(supReq, {
        params: Promise.resolve({ id: order.id }),
      });
      expect(supRes.status).toBe(403);
      const supJson = await supRes.json();
      expect(supJson.error).toBe("Forbidden");

      // 2. sewing_supervisor -> 403
      currentMockUser = { id: sewingUser.id, role: "sewing_supervisor" };

      const sewReq = new Request(`http://localhost/api/verify/${order.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const sewRes = await approveRouteHandler(sewReq, {
        params: Promise.resolve({ id: order.id }),
      });
      expect(sewRes.status).toBe(403);
      const sewJson = await sewRes.json();
      expect(sewJson.error).toBe("Forbidden");

      // Verify order remains unchanged in DB
      const dbOrder = await prisma.cuttingOrder.findUnique({
        where: { id: order.id },
      });
      expect(dbOrder?.status).toBe("PENDING_VERIFICATION");

      const logs = await prisma.verificationLog.findMany({
        where: { orderId: order.id },
      });
      expect(logs).toHaveLength(0);
    });
  });

  // Also: approving an already VERIFIED order returns 409; trying UPDATE on verification_logs fails (trigger).
  describe("Additional tests: 409 on already VERIFIED order and database trigger on UPDATE", () => {
    it("approving an already VERIFIED order returns 409", async () => {
      const order = await createTestOrderInPendingVerification(10, 360);

      // Save counts and approve first time
      const counts = order.verificationItems.map((item) => ({
        componentId: item.componentId,
        actualQty: item.expectedQty,
      }));
      await saveCounts(order.id, { counts });

      const firstApprove = await approveOrder(order.id, verifierUser.id);
      expect(firstApprove.ok).toBe(true);

      // Second approval attempt via service function -> 409
      const secondApprove = await approveOrder(order.id, verifierUser.id);
      expect(secondApprove.ok).toBe(false);
      if (!secondApprove.ok) {
        expect(secondApprove.status).toBe(409);
      }

      // Second approval attempt via route handler -> 409
      currentMockUser = { id: verifierUser.id, role: "cutting_verifier" };
      const req = new Request(`http://localhost/api/verify/${order.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const routeRes = await approveRouteHandler(req, {
        params: Promise.resolve({ id: order.id }),
      });
      expect(routeRes.status).toBe(409);
    });

    it("trying UPDATE on verification_logs fails (trigger)", async () => {
      const order = await createTestOrderInPendingVerification(10, 360);

      // Create an audit verification log row
      const log = await prisma.verificationLog.create({
        data: {
          orderId: order.id,
          verifierId: verifierUser.id,
          decision: "APPROVED",
          wastagePct: 1.5,
          componentVariances: [],
        },
      });

      // Attempting an UPDATE on the audit log row MUST fail due to the database trigger
      await expect(
        prisma.verificationLog.update({
          where: { id: log.id },
          data: { rejectionNote: "Unauthorized update attempt" },
        }),
      ).rejects.toThrow(/immutable insert-only audit table|prohibited/i);
    });
  });
});
