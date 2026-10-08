import { describe, expect, it } from "vitest";
import { computeWastagePct } from "@/lib/wastage";

describe("computeWastagePct", () => {
  it("calculates positive wastage: 95 vs 90 = 5.56", () => {
    expect(computeWastagePct(95, 90)).toBe(5.56);
  });

  it("calculates zero wastage: 90 vs 90 = 0", () => {
    expect(computeWastagePct(90, 90)).toBe(0);
  });

  it("calculates negative wastage (saved fabric): 85 vs 90 = -5.56", () => {
    expect(computeWastagePct(85, 90)).toBe(-5.56);
  });

  it("throws an error when expectedYds is <= 0", () => {
    expect(() => computeWastagePct(90, 0)).toThrow();
    expect(() => computeWastagePct(90, -10)).toThrow();
  });

  it("throws an error when actualYds is negative", () => {
    expect(() => computeWastagePct(-5, 90)).toThrow();
  });
});
