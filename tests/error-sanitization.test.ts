import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth";
import type { UserRole } from "@prisma/client";
import { POST as createOrderRouteHandler } from "@/app/api/orders/route";
import { createOrder, listCuttingOrdersForSupervisor } from "@/lib/services/orderService";

let currentMockUser: SessionUser = {
  id: "supervisor-id",
  role: "cutting_supervisor",
};

vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async (allowedRoles: readonly UserRole[]) => {
    if (!allowedRoles.includes(currentMockUser.role)) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    return { ok: true, user: currentMockUser };
  }),
}));

vi.mock("@/lib/services/orderService", () => ({
  createOrder: vi.fn(),
  listCuttingOrdersForSupervisor: vi.fn(),
}));

describe("API error sanitization", () => {
  it("does not return Prisma or SQL details in a create-order 500", async () => {
    vi.mocked(createOrder).mockRejectedValueOnce(
      new Error("PrismaClientKnownRequestError: SELECT * FROM cutting_orders"),
    );
    vi.mocked(listCuttingOrdersForSupervisor).mockResolvedValueOnce([]);

    const response = await createOrderRouteHandler(
      new Request("http://localhost/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeId: "recipe-id",
          targetQty: 10,
          fabricRollId: "ROLL-TEST",
          actualFabricYds: 360,
        }),
      }),
    );

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("Internal server error");
    expect(body.error).not.toMatch(/Prisma|SELECT|cutting_orders/i);
  });
});
