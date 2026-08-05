import { z } from "zod";

const transportDateSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "must not be empty")
  .nullable()
  .optional();

// Swagger declares no required Position properties. deviceId is required here because
// a position without it cannot be related to a device in this diagnostic probe.
export const positionSchema = z.object({
  id: z.number().int().nullable().optional(),
  deviceId: z.number().int(),
  protocol: z.string().nullable().optional(),
  deviceTime: transportDateSchema,
  fixTime: transportDateSchema,
  serverTime: transportDateSchema,
  outdated: z.boolean().nullable().optional(),
  valid: z.boolean().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  altitude: z.number().nullable().optional(),
  speed: z.number().nonnegative().nullable().optional(),
  course: z.number().nullable().optional(),
  address: z.string().nullable().optional(),
  accuracy: z.number().nullable().optional(),
  // The real API can return a structured network descriptor, not only a string.
  network: z.union([z.string(), z.record(z.string(), z.unknown())]).nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const positionsSchema = z.array(positionSchema);

export type Position = z.infer<typeof positionSchema>;
