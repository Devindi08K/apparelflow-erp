import { getStatus } from "./trafficLight";

export type GatekeeperItem = {
  expectedQty: number;
  actualQty: number | null;
};

export type ApprovalEvaluation = {
  canApprove: boolean;
  reasons: string[];
};

/**
 * Evaluates whether cut component quantities can be approved.
 * Approval is blocked (canApprove = false) if:
 * - The item list is empty.
 * - Any item is uncounted (actualQty is null).
 * - Any item is RED (actualQty < expectedQty).
 */
export function evaluateApproval(items: GatekeeperItem[]): ApprovalEvaluation {
  const reasons: string[] = [];

  if (items.length === 0) {
    reasons.push("Item list cannot be empty.");
    return { canApprove: false, reasons };
  }

  let hasUncounted = false;
  let hasRed = false;

  for (const item of items) {
    if (item.actualQty === null) {
      hasUncounted = true;
    } else {
      const status = getStatus(item.expectedQty, item.actualQty);
      if (status === "RED") {
        hasRed = true;
      }
    }
  }

  if (hasUncounted) {
    reasons.push("One or more components are uncounted.");
  }

  if (hasRed) {
    reasons.push("One or more components have actual quantity below expected (RED status).");
  }

  return {
    canApprove: reasons.length === 0,
    reasons,
  };
}
