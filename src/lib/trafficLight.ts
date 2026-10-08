export type TrafficLightStatus = "GREEN" | "YELLOW" | "RED";

/**
 * Returns the traffic-light verification status:
 * - 'GREEN' if actual === expected
 * - 'YELLOW' if actual > expected
 * - 'RED' if actual < expected
 *
 * Throws an Error on non-integer or negative inputs.
 */
export function getStatus(expected: number, actual: number): TrafficLightStatus {
  if (
    typeof expected !== "number" ||
    typeof actual !== "number" ||
    !Number.isInteger(expected) ||
    !Number.isInteger(actual) ||
    expected < 0 ||
    actual < 0
  ) {
    throw new Error("Expected and actual quantities must be non-negative integers.");
  }

  if (actual === expected) {
    return "GREEN";
  }

  if (actual > expected) {
    return "YELLOW";
  }

  return "RED";
}
