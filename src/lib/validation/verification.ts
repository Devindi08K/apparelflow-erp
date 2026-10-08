import { z } from "zod";

export const countItemSchema = z
  .object({
    componentId: z.string().trim().min(1, "componentId is required"),
    actualQty: z
      .number({ error: "actualQty must be a number" })
      .int("actualQty must be an integer")
      .min(0, "actualQty must be at least 0")
      .max(1000000, "actualQty must be at most 1000000"),
  })
  .strict();

export const saveCountsSchema = z
  .object({
    counts: z
      .array(countItemSchema)
      .min(1, "counts must contain at least 1 item")
      .refine(
        (items) => {
          const ids = new Set<string>();
          for (const item of items) {
            if (ids.has(item.componentId)) {
              return false;
            }
            ids.add(item.componentId);
          }
          return true;
        },
        { message: "Duplicate componentId entries are not allowed" },
      ),
  })
  .strict();

export type SaveCountsInput = z.infer<typeof saveCountsSchema>;

export const rejectSchema = z
  .object({
    note: z
      .string({ error: "note must be a string" })
      .trim()
      .min(5, "note must be at least 5 characters")
      .max(500, "note must be at most 500 characters"),
  })
  .strict();

export type RejectInput = z.infer<typeof rejectSchema>;

export const approveSchema = z.object({}).strict();

export type ApproveInput = z.infer<typeof approveSchema>;
