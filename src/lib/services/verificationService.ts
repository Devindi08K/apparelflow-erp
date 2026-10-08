import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeExpectedFabric } from "@/lib/multiplier";
import { getStatus, type TrafficLightStatus } from "@/lib/trafficLight";

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
