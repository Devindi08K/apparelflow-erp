/**
 * Computes fabric wastage percentage:
 * ((actualYds - expectedYds) / expectedYds) * 100, rounded to 2 decimals.
 * Negative results are allowed (saved fabric).
 * Throws an Error if expectedYds <= 0.
 */
export function computeWastagePct(actualYds: number, expectedYds: number): number {
  if (
    typeof expectedYds !== "number" ||
    Number.isNaN(expectedYds) ||
    expectedYds <= 0
  ) {
    throw new Error("expectedYds must be a positive number greater than 0.");
  }

  if (typeof actualYds !== "number" || Number.isNaN(actualYds) || actualYds < 0) {
    throw new Error("actualYds must be a non-negative number.");
  }

  const rawPct = ((actualYds - expectedYds) / expectedYds) * 100;
  const rounded = Number(rawPct.toFixed(2));
  return rounded === 0 ? 0 : rounded;
}
