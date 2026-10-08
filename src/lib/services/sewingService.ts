import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ApprovedLog = {
  verifier: {
    fullName: string;
  };
  timestamp: Date;
  wastagePct: Prisma.Decimal;
  componentVariances: Prisma.JsonValue;
};

export type SewingQueueOrder = {
  id: string;
  orderNo: string;
  recipeName: string;
  targetQty: number;
  fabricRollId: string;
  verifierName: string;
  verifiedAt: Date;
  wastagePct: number;
  wastageCap: number;
};

export async function listSewingQueue(): Promise<SewingQueueOrder[]> {
  const orders = await prisma.cuttingOrder.findMany({
    where: { status: "VERIFIED" },
    orderBy: { updatedAt: "desc" },
    include: {
      recipe: {
        select: {
          name: true,
          wastageCap: true,
        },
      },
      verificationLogs: {
        where: { decision: "APPROVED" },
        orderBy: { timestamp: "desc" },
        take: 1,
        select: {
          verifier: {
            select: { fullName: true },
          },
          timestamp: true,
          wastagePct: true,
          componentVariances: true,
        },
      },
    },
  });

  return orders.flatMap((order) => {
    const approvedLog = order.verificationLogs[0];
    if (!approvedLog) {
      return [];
    }

    return [
      {
        id: order.id,
        orderNo: order.orderNo,
        recipeName: order.recipe.name,
        targetQty: order.targetQty,
        fabricRollId: order.fabricRollId,
        verifierName: approvedLog.verifier.fullName,
        verifiedAt: approvedLog.timestamp,
        wastagePct: Number(approvedLog.wastagePct),
        wastageCap: Number(order.recipe.wastageCap),
      },
    ];
  });
}

export type SewingVerificationItem = {
  componentName: string;
  expectedQty: number;
  actualQty: number | null;
  variance: number | null;
  status: string | null;
};

export type SewingOrderDetail = {
  id: string;
  orderNo: string;
  recipeName: string;
  targetQty: number;
  fabricRollId: string;
  status: "VERIFIED" | "SEWING_STARTED";
  verificationItems: SewingVerificationItem[];
  approvedVerification: {
    verifierName: string;
    timestamp: Date;
    wastagePct: number;
    componentVariances: Prisma.JsonValue;
  };
  wastageCap: number;
  wastageExceedsCap: boolean;
};

export async function getSewingOrder(
  orderId: string,
): Promise<SewingOrderDetail | null> {
  const order = await prisma.cuttingOrder.findFirst({
    where: {
      id: orderId,
      status: { in: ["VERIFIED", "SEWING_STARTED"] },
    },
    include: {
      recipe: {
        select: {
          name: true,
          wastageCap: true,
        },
      },
      verificationItems: {
        include: {
          component: {
            select: { componentName: true },
          },
        },
        orderBy: {
          component: { componentName: "asc" },
        },
      },
      verificationLogs: {
        where: { decision: "APPROVED" },
        orderBy: { timestamp: "desc" },
        take: 1,
        select: {
          verifier: {
            select: { fullName: true },
          },
          timestamp: true,
          wastagePct: true,
          componentVariances: true,
        },
      },
    },
  });

  const approvedLog = order?.verificationLogs[0];
  if (!order || !approvedLog) {
    return null;
  }

  const wastagePct = Number(approvedLog.wastagePct);
  const wastageCap = Number(order.recipe.wastageCap);
  const status = order.status === "VERIFIED" ? "VERIFIED" : "SEWING_STARTED";

  return {
    id: order.id,
    orderNo: order.orderNo,
    recipeName: order.recipe.name,
    targetQty: order.targetQty,
    fabricRollId: order.fabricRollId,
    status,
    verificationItems: order.verificationItems.map((item) => ({
      componentName: item.component.componentName,
      expectedQty: item.expectedQty,
      actualQty: item.actualQty,
      variance: item.actualQty === null ? null : item.actualQty - item.expectedQty,
      status: item.status,
    })),
    approvedVerification: {
      verifierName: approvedLog.verifier.fullName,
      timestamp: approvedLog.timestamp,
      wastagePct,
      componentVariances: approvedLog.componentVariances,
    },
    wastageCap,
    wastageExceedsCap: wastagePct > wastageCap,
  };
}