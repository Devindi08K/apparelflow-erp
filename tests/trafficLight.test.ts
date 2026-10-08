import { describe, expect, it } from "vitest";
import { getStatus } from "@/lib/trafficLight";

describe("getStatus", () => {
  it("returns GREEN when actual equals expected", () => {
    expect(getStatus(100, 100)).toBe("GREEN");
  });

  it("returns YELLOW when actual is greater than expected", () => {
    expect(getStatus(100, 105)).toBe("YELLOW");
  });

  it("returns RED when actual is less than expected", () => {
    expect(getStatus(100, 95)).toBe("RED");
  });

  it("returns RED when actual is 0 and expected > 0", () => {
    expect(getStatus(10, 0)).toBe("RED");
  });

  it("throws an error for negative inputs", () => {
    expect(() => getStatus(-1, 10)).toThrow();
    expect(() => getStatus(10, -5)).toThrow();
  });

  it("throws an error for non-integer inputs", () => {
    expect(() => getStatus(10.5, 10)).toThrow();
    expect(() => getStatus(10, 10.2)).toThrow();
  });
});
