import { z } from "zod";

const optionalDate = z.string().min(1).nullable().optional();
const optionalFiniteNumber = z.number().finite().nullable().optional();

export const sessionResponseSchema = z.object({ token: z.string().refine((value) => value.trim().length > 0) });
export const devicesResponseSchema = z.array(z.object({
  id: z.number().int().positive(),
  name: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  disabled: z.boolean().nullable().optional(),
  lastUpdate: optionalDate,
}));
export const positionsResponseSchema = z.array(z.object({
  deviceId: z.number().int().positive(),
  fixTime: optionalDate,
  valid: z.boolean().nullable().optional(),
  outdated: z.boolean().nullable().optional(),
  speed: optionalFiniteNumber.refine((value) => value === undefined || value === null || value >= 0),
  latitude: optionalFiniteNumber.refine((value) => value === undefined || value === null || (value >= -90 && value <= 90)),
  longitude: optionalFiniteNumber.refine((value) => value === undefined || value === null || (value >= -180 && value <= 180)),
  network: z.union([z.string(), z.object({})]).nullable().optional(),
  attributes: z.unknown().optional(),
}));
export const runsResponseSchema = z.array(z.object({
  id: z.number().int().positive(),
  runDistance: z.number().finite().nonnegative(),
}));
