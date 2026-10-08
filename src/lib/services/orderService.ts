import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeExpectedComponents } from "@/lib/multiplier";
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
      const created = await prisma.$transaction(async (tx) => {
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
      });

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
