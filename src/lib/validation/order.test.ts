import { describe, expect, it } from "vitest";
import { createOrderSchema, zodErrorToFieldErrors } from "./order";

const validPayload = {
  recipeId: "recipe-abc",
  targetQty: 50,
  fabricRollId: "ROLL-001",
  actualFabricYds: 90.5,
};

describe("createOrderSchema", () => {
  it("accepts a valid payload", () => {
    const result = createOrderSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validPayload);
    }
  });

  it("rejects targetQty 2.5 (decimal)", () => {
    const result = createOrderSchema.safeParse({
      ...validPayload,
      targetQty: 2.5,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(zodErrorToFieldErrors(result.error)).toHaveProperty("targetQty");
    }
  });

  it("rejects targetQty -5", () => {
    const result = createOrderSchema.safeParse({
      ...validPayload,
      targetQty: -5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects targetQty 0", () => {
    const result = createOrderSchema.safeParse({
      ...validPayload,
      targetQty: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects targetQty "50" (string — no coerce)', () => {
    const result = createOrderSchema.safeParse({
      ...validPayload,
      targetQty: "50",
    });
    expect(result.success).toBe(false);
  });

  it('rejects targetQty ""', () => {
    const result = createOrderSchema.safeParse({
      ...validPayload,
      targetQty: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects targetQty null", () => {
    const result = createOrderSchema.safeParse({
      ...validPayload,
      targetQty: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing targetQty", () => {
    const { targetQty: _omit, ...withoutTargetQty } = validPayload;
    const result = createOrderSchema.safeParse(withoutTargetQty);
    expect(result.success).toBe(false);
  });

  it("rejects fabricRollId with spaces", () => {
    const result = createOrderSchema.safeParse({
      ...validPayload,
      fabricRollId: "ROLL 001",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(zodErrorToFieldErrors(result.error)).toHaveProperty(
        "fabricRollId",
      );
    }
  });

  it("rejects fabricRollId with symbols", () => {
    const result = createOrderSchema.safeParse({
      ...validPayload,
      fabricRollId: "ROLL_001!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects actualFabricYds -1", () => {
    const result = createOrderSchema.safeParse({
      ...validPayload,
      actualFabricYds: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects actualFabricYds 0", () => {
    const result = createOrderSchema.safeParse({
      ...validPayload,
      actualFabricYds: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra unknown keys (.strict)", () => {
    const result = createOrderSchema.safeParse({
      ...validPayload,
      sneakyRole: "admin",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = zodErrorToFieldErrors(result.error);
      expect(fields).toHaveProperty("sneakyRole");
    }
  });
});

describe("zodErrorToFieldErrors", () => {
  it("maps issues to { field: message }", () => {
    const result = createOrderSchema.safeParse({
      ...validPayload,
      targetQty: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = zodErrorToFieldErrors(result.error);
      expect(typeof fields.targetQty).toBe("string");
      expect(fields.targetQty.length).toBeGreaterThan(0);
    }
  });
});
