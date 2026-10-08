import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { listSewingQueue } from "@/lib/services/sewingService";
import { GET as queueRouteHandler } from "@/app/api/sewing/queue/route";
import { GET as detailRouteHandler } from "@/app/api/sewing/[id]/route";
import { POST as startRouteHandler } from "@/app/api/sewing/[id]/start/route";

let currentMockUser: SessionUser | null = null;

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

describe("PART E: Sewing integration tests", { timeout: 30000, hookTimeout: 30000 }, () => {
  let supervisorUser: { id: string };
  let verifierUser: { id: string };
  let sewingUser: { id: string };
  let testRecipe: {
    id: string;
    components: Array<{
      id: string;
      componentName: string;
      piecesPerGarment: number;
    }>;
  };
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    let supervisor = await prisma.user.findFirst({ where: { role: "cutting_supervisor" } });
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

    let verifier = await prisma.user.findFirst({ where: { role: "cutting_verifier" } });
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

    let sewing = await prisma.user.findFirst({ where: { role: "sewing_supervisor" } });
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

    let recipe = await prisma.recipe.findFirst({ include: { components: true } });
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

    supervisorUser = supervisor;
    verifierUser = verifier;
    sewingUser = sewing;
    testRecipe = recipe;
  });

  afterAll(async () => {
    if (createdOrderIds.length > 0) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "verification_logs" DISABLE TRIGGER verification_logs_immutable_trigger;`,
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
          `ALTER TABLE "verification_logs" ENABLE TRIGGER verification_logs_immutable_trigger;`,
        );
      }
    }
    await prisma.$disconnect();
  });

  async function createOrder(
    status: "CUTTING_IN_PROGRESS" | "PENDING_VERIFICATION" | "REJECTED" | "VERIFIED" | "SEWING_STARTED",
  ) {
    const targetQty = 10;
    const order = await prisma.cuttingOrder.create({
      data: {
        orderNo: `SEW-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        recipeId: testRecipe.id,
        targetQty,
        fabricRollId: "ROLL-SEW-TEST",
        actualFabricYds: 360,
        status,
        createdById: supervisorUser.id,
        sewingStartedBy: status === "SEWING_STARTED" ? sewingUser.id : null,
        sewingStartedAt: status === "SEWING_STARTED" ? new Date() : null,
        verificationItems: {
          create: testRecipe.components.map((component) => ({
            componentId: component.id,
            expectedQty: component.piecesPerGarment * targetQty,
            actualQty: status === "VERIFIED" || status === "SEWING_STARTED"
              ? component.piecesPerGarment * targetQty
              : null,
            status: status === "VERIFIED" || status === "SEWING_STARTED" ? "GREEN" : null,
          })),
        },
      },
    });

    createdOrderIds.push(order.id);

    if (status === "VERIFIED" || status === "SEWING_STARTED") {
      await prisma.verificationLog.create({
        data: {
          orderId: order.id,
          verifierId: verifierUser.id,
          decision: "APPROVED",
          wastagePct: 1.25,
          componentVariances: {},
        },
      });
    }

    return order;
  }

  function setUser(role: UserRole, id: string) {
    currentMockUser = { role, id };
  }

  function routeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  describe("queue visibility", () => {
    it("returns only VERIFIED orders across every order status", async () => {
      const statuses = [
        "CUTTING_IN_PROGRESS",
        "PENDING_VERIFICATION",
        "REJECTED",
        "VERIFIED",
        "SEWING_STARTED",
      ] as const;
      const orders = await Promise.all(statuses.map((status) => createOrder(status)));

      setUser("sewing_supervisor", sewingUser.id);
      const response = await queueRouteHandler(
        new Request("http://localhost/api/sewing/queue"),
      );
      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        orders: Array<{ id: string }>;
      };

      const returnedSeededOrders = json.orders.filter((order) => createdOrderIds.includes(order.id));
      expect(returnedSeededOrders.map((order) => order.id)).toEqual([orders[3].id]);
      const serviceSeededOrders = (await listSewingQueue()).filter((order) => createdOrderIds.includes(order.id));
      expect(serviceSeededOrders.map((order) => order.id)).toEqual([orders[3].id]);
    });

    it("ignores status and other query parameters", async () => {
      const verified = await createOrder("VERIFIED");
      await createOrder("PENDING_VERIFICATION");
      setUser("sewing_supervisor", sewingUser.id);

      const response = await queueRouteHandler(
        new Request("http://localhost/api/sewing/queue?status=PENDING_VERIFICATION&all=true"),
      );
      expect(response.status).toBe(200);
      const json = (await response.json()) as { orders: Array<{ id: string }> };
      const returnedSeededOrders = json.orders.filter((order) => createdOrderIds.includes(order.id));
      expect(returnedSeededOrders.map((order) => order.id)).toContain(verified.id);
      expect(returnedSeededOrders.every((order) => order.id !== createdOrderIds[createdOrderIds.length - 1])).toBe(true);
    });
  });

  it("returns 404 for PENDING_VERIFICATION and REJECTED detail requests", async () => {
    const pending = await createOrder("PENDING_VERIFICATION");
    const rejected = await createOrder("REJECTED");
    setUser("sewing_supervisor", sewingUser.id);

    const pendingResponse = await detailRouteHandler(
      new Request(`http://localhost/api/sewing/${pending.id}`),
      routeParams(pending.id),
    );
    const rejectedResponse = await detailRouteHandler(
      new Request(`http://localhost/api/sewing/${rejected.id}`),
      routeParams(rejected.id),
    );

    expect(pendingResponse.status).toBe(404);
    expect(rejectedResponse.status).toBe(404);
  });

  describe("sewing route authorization", () => {
    it("returns 403 for cutting_supervisor and cutting_verifier on queue, detail, and start", async () => {
      const order = await createOrder("VERIFIED");

      for (const user of [
        { role: "cutting_supervisor" as const, id: supervisorUser.id },
        { role: "cutting_verifier" as const, id: verifierUser.id },
      ]) {
        setUser(user.role, user.id);
        expect((await queueRouteHandler(new Request("http://localhost/api/sewing/queue"))).status).toBe(403);
        expect((await detailRouteHandler(new Request("http://localhost/api/sewing/" + order.id), routeParams(order.id))).status).toBe(403);
        expect((await startRouteHandler(new Request("http://localhost/api/sewing/" + order.id + "/start", { method: "POST", body: "{}" }), routeParams(order.id))).status).toBe(403);
      }
    });

    it("returns 401 for unauthenticated queue, detail, and start requests", async () => {
      const order = await createOrder("VERIFIED");
      currentMockUser = null;

      expect((await queueRouteHandler(new Request("http://localhost/api/sewing/queue"))).status).toBe(401);
      expect((await detailRouteHandler(new Request("http://localhost/api/sewing/" + order.id), routeParams(order.id))).status).toBe(401);
      expect((await startRouteHandler(new Request("http://localhost/api/sewing/" + order.id + "/start", { method: "POST", body: "{}" }), routeParams(order.id))).status).toBe(401);
    });
  });

  it("starts a VERIFIED order with the session user and rejects a second start", async () => {
    const order = await createOrder("VERIFIED");
    setUser("sewing_supervisor", sewingUser.id);

    const firstResponse = await startRouteHandler(
      new Request(`http://localhost/api/sewing/${order.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      routeParams(order.id),
    );
    expect(firstResponse.status).toBe(200);
    const firstJson = (await firstResponse.json()) as {
      order: { status: string; sewingStartedBy: string };
    };
    expect(firstJson.order.status).toBe("SEWING_STARTED");
    expect(firstJson.order.sewingStartedBy).toBe(sewingUser.id);

    const dbOrder = await prisma.cuttingOrder.findUnique({ where: { id: order.id } });
    expect(dbOrder?.status).toBe("SEWING_STARTED");
    expect(dbOrder?.sewingStartedBy).toBe(sewingUser.id);

    const secondResponse = await startRouteHandler(
      new Request(`http://localhost/api/sewing/${order.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      routeParams(order.id),
    );
    expect(secondResponse.status).toBe(409);
  });

  it("returns 409 when starting a PENDING_VERIFICATION order", async () => {
    const order = await createOrder("PENDING_VERIFICATION");
    setUser("sewing_supervisor", sewingUser.id);

    const response = await startRouteHandler(
      new Request(`http://localhost/api/sewing/${order.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      routeParams(order.id),
    );

    expect(response.status).toBe(409);
    const json = (await response.json()) as { error: string };
    expect(json.error).toContain("must be 'VERIFIED'");
  });
});
