import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  InvalidTransitionError,
  ORDER_STATUSES,
  type OrderStatus,
} from "@/lib/stateMachine";

const LEGAL_TRANSITIONS: Array<[OrderStatus, OrderStatus]> = [
  ["CUTTING_IN_PROGRESS", "PENDING_VERIFICATION"],
  ["PENDING_VERIFICATION", "VERIFIED"],
  ["PENDING_VERIFICATION", "REJECTED"],
  ["REJECTED", "PENDING_VERIFICATION"],
  ["VERIFIED", "SEWING_STARTED"],
];

describe("canTransition / assertTransition", () => {
  it.each(LEGAL_TRANSITIONS)(
    "allows legal transition %s -> %s",
    (from, to) => {
      expect(canTransition(from, to)).toBe(true);
      expect(() => assertTransition(from, to)).not.toThrow();
    },
  );

  it("rejects CUTTING_IN_PROGRESS -> VERIFIED", () => {
    expect(canTransition("CUTTING_IN_PROGRESS", "VERIFIED")).toBe(false);
    expect(() =>
      assertTransition("CUTTING_IN_PROGRESS", "VERIFIED"),
    ).toThrow(InvalidTransitionError);
  });

  it("rejects REJECTED -> VERIFIED", () => {
    expect(canTransition("REJECTED", "VERIFIED")).toBe(false);
    expect(() => assertTransition("REJECTED", "VERIFIED")).toThrow(
      InvalidTransitionError,
    );
  });

  it("rejects every transition out of SEWING_STARTED", () => {
    for (const to of ORDER_STATUSES) {
      expect(canTransition("SEWING_STARTED", to)).toBe(false);
      expect(() => assertTransition("SEWING_STARTED", to)).toThrow(
        InvalidTransitionError,
      );
    }
  });

  it("throws a typed InvalidTransitionError with from/to", () => {
    try {
      assertTransition("CUTTING_IN_PROGRESS", "VERIFIED");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTransitionError);
      const typed = error as InvalidTransitionError;
      expect(typed.from).toBe("CUTTING_IN_PROGRESS");
      expect(typed.to).toBe("VERIFIED");
    }
  });
});
