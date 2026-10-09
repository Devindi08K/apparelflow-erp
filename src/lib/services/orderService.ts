import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeExpectedComponents } from "@/lib/multiplier";
import {
  assertTransition,
  InvalidTransitionError,
  type OrderStatus,
} from "@/lib/stateMachine";
import {
  createOrderSchema,
  zodErrorToFieldErrors,
} from "@/lib/validation/order";

export async function listRecipesWithComponents() {
  return prisma.recipe.findMany({
    orderBy: { recipeCode: "asc" },
    include: {
      components: {
        orderBy: { componentName: "asc" },
      },
    },
  });
}

export async function listCuttingOrdersForSupervisor() {
  const orders = await prisma.cuttingOrder.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      recipe: {
        select: { name: true },
      },
      createdBy: {
        select: { fullName: true },
      },
    },
  });

  return orders.map((order) => ({
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    targetQty: order.targetQty,
    fabricRollId: order.fabricRollId,
    actualFabricYds: order.actualFabricYds,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    recipeId: order.recipeId,
    recipeName: order.recipe.name,
    createdByName: order.createdBy.fullName,
  }));
}

type TxClient = Prisma.TransactionClient;

function utcDateStamp(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** CO-YYYYMMDD-NNN — next sequence for the UTC day. */
async function allocateOrderNo(tx: TxClient): Promise<string> {
  const prefix = `CO-${utcDateStamp()}-`;

  const latest = await tx.cuttingOrder.findFirst({
    where: { orderNo: { startsWith: prefix } },
    orderBy: { orderNo: "desc" },
    select: { orderNo: true },
  });

  let next = 1;
  if (latest) {
    const seqPart = latest.orderNo.slice(prefix.length);
    const parsed = Number.parseInt(seqPart, 10);
    if (!Number.isNaN(parsed)) {
      next = parsed + 1;
    }
  }

  return `${prefix}${String(next).padStart(3, "0")}`;
}

function isOrderNoUniqueViolation(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;
  if (!target) {
    // Narrow create path: only orderNo is collision-prone.
    return true;
  }

  const fields = Array.isArray(target)
    ? target.map(String)
    : [String(target)];

  return fields.some((field) => field === "order_no" || field === "orderNo");
}

export type CreateOrderFailure =
  | { ok: false; status: 422; errors: Record<string, string> }
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 500; error: string };

export type CreateOrderSuccess = {
  ok: true;
  order: {
    id: string;
    orderNo: string;
    recipeId: string;
    targetQty: number;
    fabricRollId: string;
    actualFabricYds: Prisma.Decimal;
    status: "CUTTING_IN_PROGRESS";
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
    expectedComponents: Array<{
      componentId: string;
      componentName: string;
      expectedQty: number;
      verificationItemId: string;
    }>;
  };
};

export type CreateOrderResult = CreateOrderSuccess | CreateOrderFailure;

/**
 * Creates a cutting order + verification item stubs.
 * status, createdBy, orderNo, and expectedQty are never taken from the client.
 */
export async function createOrder(
  userId: string,
  body: unknown,
): Promise<CreateOrderResult> {
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      status: 422,
      errors: zodErrorToFieldErrors(parsed.error),
    };
  }

  const input = parsed.data;

  const recipe = await prisma.recipe.findUnique({
    where: { id: input.recipeId },
    include: { components: true },
  });

  if (!recipe) {
    return { ok: false, status: 404, error: "Recipe not found" };
  }

  const expectedComponents = computeExpectedComponents(
    input.targetQty,
    recipe.components.map((c) => ({
      id: c.id,
      componentName: c.componentName,
      piecesPerGarment: c.piecesPerGarment,
    })),
  );

  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const created = await prisma.$transaction(
        async (tx) => {
          const orderNo = await allocateOrderNo(tx);

          const order = await tx.cuttingOrder.create({
            data: {
              orderNo,
              recipeId: recipe.id,
              targetQty: input.targetQty,
              fabricRollId: input.fabricRollId,
              actualFabricYds: input.actualFabricYds,
              status: "CUTTING_IN_PROGRESS",
              createdById: userId,
              verificationItems: {
                create: expectedComponents.map((component) => ({
                  componentId: component.componentId,
                  expectedQty: component.expectedQty,
                  actualQty: null,
                  status: null,
                })),
              },
            },
            include: {
              verificationItems: {
                include: {
                  component: {
                    select: { componentName: true },
                  },
                },
              },
            },
          });

          return order;
        },
        { timeout: 15000, maxWait: 10000 },
      );

      return {
        ok: true,
        order: {
          id: created.id,
          orderNo: created.orderNo,
          recipeId: created.recipeId,
          targetQty: created.targetQty,
          fabricRollId: created.fabricRollId,
          actualFabricYds: created.actualFabricYds,
          status: "CUTTING_IN_PROGRESS",
          createdById: created.createdById,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
          expectedComponents: created.verificationItems.map((item) => ({
            componentId: item.componentId,
            componentName: item.component.componentName,
            expectedQty: item.expectedQty,
            verificationItemId: item.id,
          })),
        },
      };
    } catch (error) {
      if (isOrderNoUniqueViolation(error) && attempt < maxAttempts - 1) {
        continue;
      }
      throw error;
    }
  }

  return {
    ok: false,
    status: 500,
    error: "Could not allocate a unique order number",
  };
}

export type SubmitOrderFailure =
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 409; error: string }
  | { ok: false; status: 500; error: string };

export type SubmitOrderSuccess = {
  ok: true;
  order: {
    id: string;
    orderNo: string;
    recipeId: string;
    targetQty: number;
    fabricRollId: string;
    actualFabricYds: Prisma.Decimal;
    status: "PENDING_VERIFICATION";
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
    verificationItems: Array<{
      id: string;
      orderId: string;
      componentId: string;
      expectedQty: number;
      actualQty: number | null;
      status: string | null;
      component: {
        componentName: string;
      };
    }>;
  };
};

export type SubmitOrderResult = SubmitOrderSuccess | SubmitOrderFailure;

/**
 * Submits an order for verification (transition to PENDING_VERIFICATION).
 * In a transaction: re-reads order, asserts transition, resets verification items if resubmitting from REJECTED, and updates status.
 */
export async function submitOrder(orderId: string): Promise<SubmitOrderResult> {
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const order = await tx.cuttingOrder.findUnique({
          where: { id: orderId },
        });

        if (!order) {
          return { notFound: true } as const;
        }

        assertTransition(order.status as OrderStatus, "PENDING_VERIFICATION");

        if (order.status === "REJECTED") {
          await tx.verificationItem.updateMany({
            where: { orderId: order.id },
            data: {
              actualQty: null,
              status: null,
            },
          });
        }

        const updated = await tx.cuttingOrder.update({
          where: { id: order.id },
          data: {
            status: "PENDING_VERIFICATION",
          },
          include: {
            verificationItems: {
              include: {
                component: {
                  select: { componentName: true },
                },
              },
            },
          },
        });

        return { notFound: false, order: updated } as const;
      },
      { timeout: 15000, maxWait: 10000 },
    );

    if (result.notFound) {
      return { ok: false, status: 404, error: "Order not found" };
    }

    return {
      ok: true,
      order: result.order as SubmitOrderSuccess["order"],
    };
  } catch (error) {
    if (error instanceof InvalidTransitionError) {
      return {
        ok: false,
        status: 409,
        error: `Invalid order status transition: ${error.from} -> ${error.to}`,
      };
    }
    console.error("Error submitting order:", error);
    return { ok: false, status: 500, error: "Internal server error" };
  }
}
