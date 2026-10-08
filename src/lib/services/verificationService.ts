import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeExpectedFabric } from "@/lib/multiplier";
import { computeWastagePct } from "@/lib/wastage";
import { getStatus, type TrafficLightStatus } from "@/lib/trafficLight";
import { evaluateApproval, type ApprovalEvaluation } from "@/lib/gatekeeper";
import { assertTransition, type OrderStatus } from "@/lib/stateMachine";
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

export type ComponentVariance = {
  componentId: string;
  name: string;
  expected: number;
  actual: number | null;
  variance: number;
  status: TrafficLightStatus;
};

export type ApproveOrderFailure =
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 409; error: string }
  | { ok: false; status: 422; error: string; reasons: string[] }
  | { ok: false; status: 500; error: string };

export type ApproveOrderSuccess = {
  ok: true;
  order: {
    id: string;
    orderNo: string;
    status: "VERIFIED";
  };
  logId: string;
  wastagePct: number;
  componentVariances: ComponentVariance[];
};

export type ApproveOrderResult = ApproveOrderSuccess | ApproveOrderFailure;

/**
 * Approves a cutting order in a single transaction:
 * 1. Locks the row with SELECT ... FOR UPDATE to eliminate races.
 * 2. 404 if missing, 409 if status is not PENDING_VERIFICATION.
 * 3. Reloads verification items and verifies evaluateApproval allows approval.
 * 4. Computes wastage percentage and component variances.
 * 5. Transitions order to VERIFIED and writes an immutable verification_log entry.
 */
export async function approveOrder(
  orderId: string,
  verifierId: string,
): Promise<ApproveOrderResult> {
  try {
    type TxApproveResult =
      | { type: "NOT_FOUND" }
      | { type: "INVALID_STATUS"; currentStatus: OrderStatus }
      | { type: "CANNOT_APPROVE"; reasons: string[] }
      | {
          type: "SUCCESS";
          order: { id: string; orderNo: string; status: "VERIFIED" };
          logId: string;
          wastagePct: number;
          componentVariances: ComponentVariance[];
        };

    const txResult = await prisma.$transaction<TxApproveResult>(
      async (tx) => {
        const lockedOrders = await tx.$queryRaw<
          Array<{ id: string; status: OrderStatus }>
        >`
          SELECT id, status FROM cutting_orders WHERE id = ${orderId} FOR UPDATE
        `;

        if (lockedOrders.length === 0) {
          return { type: "NOT_FOUND" };
        }

        const currentStatus = lockedOrders[0].status;
        if (currentStatus !== "PENDING_VERIFICATION") {
          return { type: "INVALID_STATUS", currentStatus };
        }

        const order = await tx.cuttingOrder.findUnique({
          where: { id: orderId },
          include: {
            recipe: true,
            verificationItems: {
              include: {
                component: true,
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
          return { type: "NOT_FOUND" };
        }

        const approval = evaluateApproval(
          order.verificationItems.map((item) => ({
            expectedQty: item.expectedQty,
            actualQty: item.actualQty,
          })),
        );

        if (!approval.canApprove) {
          return {
            type: "CANNOT_APPROVE",
            reasons: approval.reasons,
          };
        }

        const expectedFabricYds = computeExpectedFabric(
          order.targetQty,
          Number(order.recipe.stdFabricYards),
        );
        const actualFabricYds = Number(order.actualFabricYds);
        const wastagePct = computeWastagePct(actualFabricYds, expectedFabricYds);

        const componentVariances: ComponentVariance[] =
          order.verificationItems.map((item) => {
            const actual = item.actualQty ?? 0;
            const status: TrafficLightStatus =
              item.actualQty !== null
                ? getStatus(item.expectedQty, item.actualQty)
                : "RED";

            return {
              componentId: item.componentId,
              name: item.component.componentName,
              expected: item.expectedQty,
              actual: item.actualQty,
              variance: actual - item.expectedQty,
              status,
            };
          });

        assertTransition(order.status as OrderStatus, "VERIFIED");

        const updatedOrder = await tx.cuttingOrder.update({
          where: { id: order.id },
          data: {
            status: "VERIFIED",
          },
        });

        const log = await tx.verificationLog.create({
          data: {
            orderId: order.id,
            verifierId,
            decision: "APPROVED",
            rejectionNote: null,
            wastagePct: new Prisma.Decimal(wastagePct),
            componentVariances: componentVariances as unknown as Prisma.InputJsonValue,
          },
        });

        return {
          type: "SUCCESS",
          order: {
            id: updatedOrder.id,
            orderNo: updatedOrder.orderNo,
            status: "VERIFIED" as const,
          },
          logId: log.id,
          wastagePct,
          componentVariances,
        };
      },
      { timeout: 15000, maxWait: 10000 },
    );

    if (txResult.type === "NOT_FOUND") {
      return { ok: false, status: 404, error: "Order not found" };
    }

    if (txResult.type === "INVALID_STATUS") {
      return {
        ok: false,
        status: 409,
        error: `Order status is '${txResult.currentStatus}', but must be 'PENDING_VERIFICATION'`,
      };
    }

    if (txResult.type === "CANNOT_APPROVE") {
      return {
        ok: false,
        status: 422,
        error: "Order cannot be approved due to verification issues.",
        reasons: txResult.reasons,
      };
    }

    return {
      ok: true,
      order: txResult.order,
      logId: txResult.logId,
      wastagePct: txResult.wastagePct,
      componentVariances: txResult.componentVariances,
    };
  } catch (error) {
    console.error("Error approving order:", error);
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : "Internal server error",
    };
  }
}

export type RejectOrderFailure =
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 409; error: string }
  | { ok: false; status: 500; error: string };

export type RejectOrderSuccess = {
  ok: true;
  order: {
    id: string;
    orderNo: string;
    status: "REJECTED";
  };
  logId: string;
  wastagePct: number;
  componentVariances: ComponentVariance[];
};

export type RejectOrderResult = RejectOrderSuccess | RejectOrderFailure;

/**
 * Rejects a cutting order in a single transaction:
 * 1. Locks the row with SELECT ... FOR UPDATE to eliminate races / double-clicks.
 * 2. 404 if missing, 409 if status is not PENDING_VERIFICATION.
 * 3. Rejection is allowed even when counts are incomplete (no evaluateApproval gate).
 * 4. Computes wastagePct and a componentVariances snapshot from whatever counts are present.
 * 5. Transitions order to REJECTED and writes an immutable verification_log entry.
 *    verifierId always comes from the JWT session — never from the caller.
 */
export async function rejectOrder(
  orderId: string,
  verifierId: string,
  note: string,
): Promise<RejectOrderResult> {
  try {
    type TxRejectResult =
      | { type: "NOT_FOUND" }
      | { type: "INVALID_STATUS"; currentStatus: OrderStatus }
      | {
          type: "SUCCESS";
          order: { id: string; orderNo: string; status: "REJECTED" };
          logId: string;
          wastagePct: number;
          componentVariances: ComponentVariance[];
        };

    const txResult = await prisma.$transaction<TxRejectResult>(
      async (tx) => {
        const lockedOrders = await tx.$queryRaw<
          Array<{ id: string; status: OrderStatus }>
        >`
          SELECT id, status FROM cutting_orders WHERE id = ${orderId} FOR UPDATE
        `;

        if (lockedOrders.length === 0) {
          return { type: "NOT_FOUND" };
        }

        const currentStatus = lockedOrders[0].status;
        if (currentStatus !== "PENDING_VERIFICATION") {
          return { type: "INVALID_STATUS", currentStatus };
        }

        const order = await tx.cuttingOrder.findUnique({
          where: { id: orderId },
          include: {
            recipe: true,
            verificationItems: {
              include: {
                component: true,
              },
              orderBy: {
                component: { componentName: "asc" },
              },
            },
          },
        });

        if (!order) {
          return { type: "NOT_FOUND" };
        }

        const expectedFabricYds = computeExpectedFabric(
          order.targetQty,
          Number(order.recipe.stdFabricYards),
        );
        const actualFabricYds = Number(order.actualFabricYds);
        const wastagePct = computeWastagePct(actualFabricYds, expectedFabricYds);

        const componentVariances: ComponentVariance[] =
          order.verificationItems.map((item) => {
            const actual = item.actualQty ?? 0;
            const status: TrafficLightStatus =
              item.actualQty !== null
                ? getStatus(item.expectedQty, item.actualQty)
                : "RED";

            return {
              componentId: item.componentId,
              name: item.component.componentName,
              expected: item.expectedQty,
              actual: item.actualQty,
              variance: actual - item.expectedQty,
              status,
            };
          });

        assertTransition(order.status as OrderStatus, "REJECTED");

        const updatedOrder = await tx.cuttingOrder.update({
          where: { id: order.id },
          data: { status: "REJECTED" },
        });

        const log = await tx.verificationLog.create({
          data: {
            orderId: order.id,
            verifierId,
            decision: "REJECTED",
            rejectionNote: note.trim(),
            wastagePct: new Prisma.Decimal(wastagePct),
            componentVariances: componentVariances as unknown as Prisma.InputJsonValue,
          },
        });

        return {
          type: "SUCCESS",
          order: {
            id: updatedOrder.id,
            orderNo: updatedOrder.orderNo,
            status: "REJECTED" as const,
          },
          logId: log.id,
          wastagePct,
          componentVariances,
        };
      },
      { timeout: 15000, maxWait: 10000 },
    );

    if (txResult.type === "NOT_FOUND") {
      return { ok: false, status: 404, error: "Order not found" };
    }

    if (txResult.type === "INVALID_STATUS") {
      return {
        ok: false,
        status: 409,
        error: `Order status is '${txResult.currentStatus}', but must be 'PENDING_VERIFICATION'`,
      };
    }

    return {
      ok: true,
      order: txResult.order,
      logId: txResult.logId,
      wastagePct: txResult.wastagePct,
      componentVariances: txResult.componentVariances,
    };
  } catch (error) {
    console.error("Error rejecting order:", error);
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : "Internal server error",
    };
  }
}
