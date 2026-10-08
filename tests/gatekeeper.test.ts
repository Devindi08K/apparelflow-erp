import { describe, expect, it } from "vitest";
import { evaluateApproval } from "@/lib/gatekeeper";

describe("evaluateApproval", () => {
  it("blocks approval when the list is empty", () => {
    const result = evaluateApproval([]);
    expect(result.canApprove).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("blocks approval when any actualQty is null (uncounted)", () => {
    const result = evaluateApproval([
      { expectedQty: 100, actualQty: 100 },
      { expectedQty: 50, actualQty: null },
    ]);
    expect(result.canApprove).toBe(false);
    expect(result.reasons).toContain("One or more components are uncounted.");
  });

  it("blocks approval when one RED item exists among many GREEN items", () => {
    const result = evaluateApproval([
      { expectedQty: 100, actualQty: 100 },
      { expectedQty: 200, actualQty: 200 },
      { expectedQty: 50, actualQty: 48 }, // RED
    ]);
    expect(result.canApprove).toBe(false);
    expect(result.reasons).toContain(
      "One or more components have actual quantity below expected (RED status)."
    );
  });

  it("does not block approval when items are YELLOW (YELLOW alone does not block)", () => {
    const result = evaluateApproval([
      { expectedQty: 100, actualQty: 100 }, // GREEN
      { expectedQty: 50, actualQty: 55 },  // YELLOW
    ]);
    expect(result.canApprove).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("approves when all items are GREEN", () => {
    const result = evaluateApproval([
      { expectedQty: 100, actualQty: 100 },
      { expectedQty: 50, actualQty: 50 },
    ]);
    expect(result.canApprove).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });
});
