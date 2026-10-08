import { z } from "zod";

/** Yards may be fractional; reject more than 2 decimal places. */
function hasAtMostTwoDecimalPlaces(value: number): boolean {
  const fractional = value.toString().split(".")[1];
  return fractional === undefined || fractional.length <= 2;
}

export const createOrderSchema = z
  .object({
    recipeId: z.string().min(1, "recipeId is required"),
    // No z.coerce — strings/null must fail, not silently convert.
    targetQty: z
      .number({ error: "targetQty must be a number" })
      .int("targetQty must be an integer")
      .positive("targetQty must be at least 1")
      .max(10000, "targetQty must be at most 10000"),
    fabricRollId: z
      .string()
      .trim()
      .min(3, "fabricRollId must be at least 3 characters")
      .max(40, "fabricRollId must be at most 40 characters")
      .regex(
        /^[A-Za-z0-9-]+$/,
        "fabricRollId may only contain letters, numbers, and hyphens",
      ),
    actualFabricYds: z
      .number({ error: "actualFabricYds must be a number" })
      .positive("actualFabricYds must be greater than 0")
      .max(100000, "actualFabricYds must be at most 100000")
      .refine(hasAtMostTwoDecimalPlaces, {
        message: "actualFabricYds may have at most 2 decimal places",
      }),
  })
  .strict();

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/** First Zod message per field for API/UI inline errors. */
export function zodErrorToFieldErrors(
  error: z.ZodError,
): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    let field: string;

    if (issue.path.length > 0) {
      field = issue.path.map(String).join(".");
    } else if (
      issue.code === "unrecognized_keys" &&
      "keys" in issue &&
      Array.isArray(issue.keys) &&
      issue.keys.length > 0
    ) {
      field = String(issue.keys[0]);
    } else {
      field = "_form";
    }

    if (fields[field] === undefined) {
      fields[field] = issue.message;
    }
  }

  return fields;
}
