export const ORDER_STATUSES = [
  "CUTTING_IN_PROGRESS",
  "PENDING_VERIFICATION",
  "REJECTED",
  "VERIFIED",
  "SEWING_STARTED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed cutting-order status transitions. */
const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  CUTTING_IN_PROGRESS: ["PENDING_VERIFICATION"],
  PENDING_VERIFICATION: ["VERIFIED", "REJECTED"],
  REJECTED: ["PENDING_VERIFICATION"],
  VERIFIED: ["SEWING_STARTED"],
  SEWING_STARTED: [],
};

export class InvalidTransitionError extends Error {
  readonly from: OrderStatus;
  readonly to: OrderStatus;

  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Invalid order status transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}
