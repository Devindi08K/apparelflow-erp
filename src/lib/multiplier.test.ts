import { describe, expect, it } from "vitest";
import {
  computeExpectedComponents,
  computeExpectedFabric,
} from "./multiplier";

describe("computeExpectedComponents", () => {
  it("multiplies 50 garments × 2 cuffs = 100", () => {
    const result = computeExpectedComponents(50, [
      {
        id: "cuff-1",
        componentName: "Sleeve Cuffs",
        piecesPerGarment: 2,
      },
    ]);

    expect(result).toEqual([
      {
        componentId: "cuff-1",
        componentName: "Sleeve Cuffs",
        expectedQty: 100,
      },
    ]);
  });
});

describe("computeExpectedFabric", () => {
  it("multiplies 50 garments × 1.8 yards = 90", () => {
    expect(computeExpectedFabric(50, 1.8)).toBe(90);
  });
});
