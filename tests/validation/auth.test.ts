import { describe, expect, it } from "vitest";
import { loginSchema } from "@/lib/validation/auth";

describe("loginSchema", () => {
  it("accepts and normalizes a valid payload", () => {
    expect(
      loginSchema.parse({
        email: "  USER@Example.COM ",
        password: "Demo@12345",
      }),
    ).toEqual({ email: "user@example.com", password: "Demo@12345" });
  });

  it("rejects a missing email", () => {
    expect(loginSchema.safeParse({ password: "Demo@12345" }).success).toBe(false);
  });

  it.each([123, [], {}])("rejects an email with invalid type: %s", (email) => {
    expect(loginSchema.safeParse({ email, password: "Demo@12345" }).success).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ email: "user@example.com", password: "" }).success).toBe(false);
  });

  it("rejects extra keys", () => {
    expect(
      loginSchema.safeParse({
        email: "user@example.com",
        password: "Demo@12345",
        role: "cutting_supervisor",
      }).success,
    ).toBe(false);
  });
});
