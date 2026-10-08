import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertTransition, type OrderStatus } from "@/lib/stateMachine";

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

export type StartSewingResult =
  | {
      ok: true;
      order: {
        id: string;
        orderNo: string;
        status: "SEWING_STARTED";
        sewingStartedBy: string;
        sewingStartedAt: Date;
      };
    }
  | { ok: false; status: 404 | 409; error: string };

export async function startSewing(
  orderId: string,
  userId: string,
): Promise<StartSewingResult> {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const updateResult = await tx.cuttingOrder.updateMany({
      where: { id: orderId, status: "VERIFIED" },
      data: {
        status: "SEWING_STARTED",
        sewingStartedBy: userId,
        sewingStartedAt: now,
      },
    });

    if (updateResult.count !== 1) {
      const order = await tx.cuttingOrder.findUnique({
        where: { id: orderId },
        select: { id: true, status: true },
      });

      if (!order) {
        return { ok: false, status: 404, error: "Order not found" };
      }

      return {
        ok: false,
        status: 409,
        error: `Order status is '${order.status}', but must be 'VERIFIED' to start sewing`,
      };
    }

    assertTransition("VERIFIED" as OrderStatus, "SEWING_STARTED");

    const order = await tx.cuttingOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        orderNo: true,
        status: true,
        sewingStartedBy: true,
        sewingStartedAt: true,
      },
    });

    if (!order.sewingStartedBy || !order.sewingStartedAt) {
      throw new Error("Sewing start metadata was not persisted");
    }

    return {
      ok: true,
      order: {
        id: order.id,
        orderNo: order.orderNo,
        status: "SEWING_STARTED",
        sewingStartedBy: order.sewingStartedBy,
        sewingStartedAt: order.sewingStartedAt,
      },
    };
  });
}