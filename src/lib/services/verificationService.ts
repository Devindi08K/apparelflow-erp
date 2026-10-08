import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeExpectedFabric } from "@/lib/multiplier";
import { getStatus, type TrafficLightStatus } from "@/lib/trafficLight";
import { evaluateApproval, type ApprovalEvaluation } from "@/lib/gatekeeper";
import { saveCountsSchema } from "@/lib/validation/verification";
import { zodErrorToFieldErrors } from "@/lib/validation/order";

export async function listOrdersForVerification() {
  const orders = await prisma.cuttingOrder.findMany({
    where: {
      status: "PENDING_VERIFICATION",
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      recipe: {
        select: {
          name: true,
        },
      },
    },
  });

  return orders.map((order) => ({
    id: order.id,
    orderNo: order.orderNo,
    recipeId: order.recipeId,
    recipeName: order.recipe.name,
    targetQty: order.targetQty,
    fabricRollId: order.fabricRollId,
    actualFabricYds: order.actualFabricYds,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  }));
}

export type GetOrderForVerificationFailure = {
  ok: false;
  status: 404;
  error: string;
};

export type VerificationItemResponse = {
  id: string;
  componentId: string;
  componentName: string;
  imageUrl: string | null;
  expectedQty: number;
  actualQty: number | null;
  status: TrafficLightStatus | null;
};

export type GetOrderForVerificationSuccess = {
  ok: true;
  order: {
    id: string;
    orderNo: string;
    recipeId: string;
    recipeName: string;
    targetQty: number;
    fabricRollId: string;
    expectedFabricYds: number;
    actualFabricYds: Prisma.Decimal;
    status: "PENDING_VERIFICATION";
    createdAt: Date;
    updatedAt: Date;
    verificationItems: VerificationItemResponse[];
  };
};

export type GetOrderForVerificationResult =
  | GetOrderForVerificationSuccess
  | GetOrderForVerificationFailure;

/**
 * Returns an order with verification items ONLY if status is PENDING_VERIFICATION;
 * otherwise returns 404. Traffic-light status is always computed on the server.
 */
export async function getOrderForVerification(
  orderId: string,
): Promise<GetOrderForVerificationResult> {
  const order = await prisma.cuttingOrder.findFirst({
    where: {
      id: orderId,
      status: "PENDING_VERIFICATION",
    },
    include: {
      recipe: {
        select: {
          name: true,
          stdFabricYards: true,
        },
      },
      verificationItems: {
        include: {
          component: {
            select: {
              componentName: true,
              imageUrl: true,
            },
          },
        },
        orderBy: {
          component: {
            componentName: "asc",
          },
        },
      },
    },
  });

  if (!order) {
    return {
      ok: false,
      status: 404,
      error: "Order not found or not pending verification",
    };
  }

  const expectedFabricYds = computeExpectedFabric(
    order.targetQty,
    Number(order.recipe.stdFabricYards),
  );

  const verificationItems: VerificationItemResponse[] =
    order.verificationItems.map((item) => ({
      id: item.id,
      componentId: item.componentId,
      componentName: item.component.componentName,
      imageUrl: item.component.imageUrl,
      expectedQty: item.expectedQty,
      actualQty: item.actualQty,
      status:
        item.actualQty !== null
          ? getStatus(item.expectedQty, item.actualQty)
          : null,
    }));

  return {
    ok: true,
    order: {
      id: order.id,
      orderNo: order.orderNo,
      recipeId: order.recipeId,
      recipeName: order.recipe.name,
      targetQty: order.targetQty,
      fabricRollId: order.fabricRollId,
      expectedFabricYds,
      actualFabricYds: order.actualFabricYds,
      status: "PENDING_VERIFICATION",
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      verificationItems,
    },
  };
}

export type SaveCountsFailure =
  | { ok: false; status: 422; errors?: Record<string, string>; error?: string }
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 409; error: string }
  | { ok: false; status: 500; error: string };

export type SaveCountsSuccess = {
  ok: true;
  items: VerificationItemResponse[];
  verificationItems: VerificationItemResponse[];
  approval: ApprovalEvaluation;
};

export type SaveCountsResult = SaveCountsSuccess | SaveCountsFailure;

/**
 * Saves counted component quantities for an order in a single transaction.
 * - Loads order; 404 if missing, 409 if status is not PENDING_VERIFICATION.
 * - Validates every componentId belongs to the order's verification items (422).
 * - Computes and saves actualQty and server-calculated status = getStatus(expectedQty, actualQty).
 * - Returns updated items and evaluateApproval result.
 */
export async function saveCounts(
  orderId: string,
  body: unknown,
): Promise<SaveCountsResult> {
  const parsed = saveCountsSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      status: 422,
      errors: zodErrorToFieldErrors(parsed.error),
    };
  }

  const input = parsed.data;

  try {
    const txResult = await prisma.$transaction(
      async (tx) => {
        const order = await tx.cuttingOrder.findUnique({
          where: { id: orderId },
          include: {
            verificationItems: {
              include: {
                component: {
                  select: { componentName: true, imageUrl: true },
                },
              },
            },
          },
        });

        if (!order) {
          return { notFound: true } as const;
        }

        if (order.status !== "PENDING_VERIFICATION") {
          return {
            invalidStatus: true,
            currentStatus: order.status,
          } as const;
        }

        const itemMap = new Map(
          order.verificationItems.map((item) => [item.componentId, item]),
        );

        for (const count of input.counts) {
          if (!itemMap.has(count.componentId)) {
            return {
              invalidComponent: true,
              componentId: count.componentId,
            } as const;
          }
        }

        for (const count of input.counts) {
          const item = itemMap.get(count.componentId)!;
          const status = getStatus(item.expectedQty, count.actualQty);

          await tx.verificationItem.update({
            where: {
              orderId_componentId: {
                orderId: order.id,
                componentId: count.componentId,
              },
            },
            data: {
              actualQty: count.actualQty,
              status,
            },
          });
        }

        const updatedItems = await tx.verificationItem.findMany({
          where: { orderId: order.id },
          include: {
            component: {
              select: { componentName: true, imageUrl: true },
            },
          },
          orderBy: {
            component: { componentName: "asc" },
          },
        });

        const formattedItems: VerificationItemResponse[] = updatedItems.map(
          (item) => ({
            id: item.id,
            componentId: item.componentId,
            componentName: item.component.componentName,
            imageUrl: item.component.imageUrl,
            expectedQty: item.expectedQty,
            actualQty: item.actualQty,
            status:
              item.actualQty !== null
                ? getStatus(item.expectedQty, item.actualQty)
                : null,
          }),
        );

        const approval = evaluateApproval(
          updatedItems.map((item) => ({
            expectedQty: item.expectedQty,
            actualQty: item.actualQty,
          })),
        );

        return {
          success: true,
          items: formattedItems,
          approval,
        } as const;
      },
      { timeout: 15000, maxWait: 10000 },
    );

    if ("notFound" in txResult) {
      return { ok: false, status: 404, error: "Order not found" };
    }

    if ("invalidStatus" in txResult) {
      return {
        ok: false,
        status: 409,
        error: `Order status is '${txResult.currentStatus}', but must be 'PENDING_VERIFICATION'`,
      };
    }

    if ("invalidComponent" in txResult) {
      return {
        ok: false,
        status: 422,
        error: `Component ID '${txResult.componentId}' does not belong to this order's verification items`,
      };
    }

    return {
      ok: true,
      items: txResult.items,
      verificationItems: txResult.items,
      approval: txResult.approval,
    };
  } catch (error) {
    console.error("Error saving counts:", error);
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : "Internal server error",
    };
  }
}
