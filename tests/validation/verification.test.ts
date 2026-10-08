import { describe, expect, it } from "vitest";
import {
  approveSchema,
  rejectSchema,
  saveCountsSchema,
} from "@/lib/validation/verification";

describe("saveCountsSchema", () => {
  const validPayload = {
    counts: [
      { componentId: "comp-1", actualQty: 50 },
      { componentId: "comp-2", actualQty: 0 },
    ],
  };

  it("accepts a valid counts payload", () => {
    const result = saveCountsSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validPayload);
    }
  });

  it("rejects negative actualQty", () => {
    const result = saveCountsSchema.safeParse({
      counts: [{ componentId: "comp-1", actualQty: -5 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects decimal actualQty", () => {
    const result = saveCountsSchema.safeParse({
      counts: [{ componentId: "comp-1", actualQty: 12.5 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects string "12" for actualQty (no coerce)', () => {
    const result = saveCountsSchema.safeParse({
      counts: [{ componentId: "comp-1", actualQty: "12" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects null for actualQty", () => {
    const result = saveCountsSchema.safeParse({
      counts: [{ componentId: "comp-1", actualQty: null }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate componentId in counts array", () => {
    const result = saveCountsSchema.safeParse({
      counts: [
        { componentId: "comp-1", actualQty: 50 },
        { componentId: "comp-1", actualQty: 60 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty array for counts", () => {
    const result = saveCountsSchema.safeParse({
      counts: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra keys on root object or count item (.strict)", () => {
    const result1 = saveCountsSchema.safeParse({
      ...validPayload,
      extraField: "invalid",
    });
    expect(result1.success).toBe(false);

    const result2 = saveCountsSchema.safeParse({
      counts: [{ componentId: "comp-1", actualQty: 10, extra: true }],
    });
    expect(result2.success).toBe(false);
  });
});

describe("rejectSchema", () => {
  it("accepts a valid note", () => {
    const result = rejectSchema.safeParse({
      note: "Material cutting had fraying and defects.",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBe("Material cutting had fraying and defects.");
    }
  });

  it('rejects whitespace-only note "   "', () => {
    const result = rejectSchema.safeParse({
      note: "   ",
    });
    expect(result.success).toBe(false);
  });

  it('rejects note with length less than 5 characters "ab"', () => {
    const result = rejectSchema.safeParse({
      note: "ab",
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra keys on reject payload (.strict)", () => {
    const result = rejectSchema.safeParse({
      note: "Reasonable rejection note here",
      unauthorizedField: 123,
    });
    expect(result.success).toBe(false);
  });
});

describe("approveSchema", () => {
  it("accepts an empty object", () => {
    const result = approveSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({});
    }
  });

  it("rejects extra keys on approve (.strict)", () => {
    const result = approveSchema.safeParse({
      status: "APPROVED",
      override: true,
    });
    expect(result.success).toBe(false);
  });
});
