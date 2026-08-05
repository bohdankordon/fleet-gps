import { z } from "zod";

// Swagger does not mark Device properties as required, so optional fields are accepted.
export const deviceSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().optional(),
  status: z.string().nullable().optional(),
  disabled: z.boolean().nullable().optional(),
  // Date parsing belongs to normalization: the API does not consistently return ISO 8601.
  // The refinement preserves the original string while rejecting blank values.
  lastUpdate: z.string().refine((value) => value.trim().length > 0, "must not be empty").nullable().optional(),
  positionId: z.number().int().nullable().optional(),
  groupId: z.number().int().nullable().optional(),
});

export const devicesSchema = z.array(deviceSchema);

export type Device = z.infer<typeof deviceSchema>;
