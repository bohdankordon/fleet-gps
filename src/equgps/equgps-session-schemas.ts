import { z } from "zod";

export const sessionSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().optional(),
  token: z.string().trim().min(1, "must be a non-empty string"),
});

export type EqugpsSession = z.infer<typeof sessionSchema>;
