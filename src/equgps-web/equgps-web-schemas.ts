import { z } from "zod";

const stringCoordinatesSchema = z.array(z.string());

export const webRunSchema = z.object({
  id: z.number().optional(),
  runDistance: z.number().optional(),
});
export const webRunsSchema = z.array(webRunSchema);

export const mode1DataPositionsSchema = z.object({
  startC: stringCoordinatesSchema.optional(), endC: stringCoordinatesSchema.optional(), maxSpeed: z.string().nullable().optional(),
  motoHours: z.number().int().optional(), lastTime: z.number().int().optional(), distance: z.number().optional(), goTime: z.number().int().optional(),
});

export const mode1DataGoSchema = z.object({
  startTime: z.number().int().optional(), endTime: z.number().int().optional(), startC: stringCoordinatesSchema.optional(), endC: stringCoordinatesSchema.optional(),
  distance: z.number().optional(), maxSpeed: z.string().nullable().optional(), firstId: z.number().int().optional(), lastId: z.number().int().optional(),
  startC_string: z.string().optional(), endC_string: z.string().optional(), startTimeString: z.string().optional(), endTimeString: z.string().optional(),
  runTime: z.string().optional(), stopTime: z.string().optional(), stopLong: z.string().optional(), stopLongSeconds: z.number().int().optional(),
  startA: z.string().optional(), endA: z.string().optional(),
});

export const mode1Schema = z.object({
  dataPositions: mode1DataPositionsSchema.optional(), dataGo: z.array(mode1DataGoSchema).optional(),
  stateReportDate: z.string().optional(),
});

export const mode2SpeedSchema = z.object({
  id: z.number().int().optional(), deviceid: z.number().int().optional(), lat: z.string().optional(), lon: z.string().optional(),
  fixtime: z.string().optional(), speed: z.number().optional(), timeLine: z.string().optional(), overPercent: z.number().int().optional(),
});

export const mode2Schema = z.object({
  dataSpeed: z.array(mode2SpeedSchema).optional(), maxRegSpeed: z.number().optional(), stateMaxSpeed: z.number().int().optional(), stateReportDate: z.string().optional(),
});

export const webInfoSchema = z.object({
  infoReport: z.object({ mode1: mode1Schema.optional(), mode2: mode2Schema.optional() }).optional(),
  attributes: z.string().nullable().optional(),
});
export const webInfoResponseSchema = z.array(webInfoSchema);

const routePositionSchema = z.object({
  id: z.number().int().optional(), deviceid: z.number().int().optional(), protocol: z.string().optional(), servertime: z.string().optional(), devicetime: z.string().optional(), fixtime: z.string().optional(),
  valid: z.boolean().optional(), latitude: z.string().optional(), longitude: z.string().optional(), altitude: z.string().optional(), speed: z.string().optional(), course: z.string().optional(),
  address: z.string().nullable().optional(), attributes: z.string().optional(), accuracy: z.string().optional(), network: z.string().optional(),
  latitudegps: z.string().optional(), longitudegps: z.string().optional(), id_real: z.number().int().optional(), u_time: z.number().int().optional(),
});
const routeDataGoSchema = mode1DataGoSchema.extend({ positions: z.array(routePositionSchema).optional() });

export const webRoutesSchema = z.object({
  dataPositions: mode1DataPositionsSchema.optional(), dataGo: z.array(routeDataGoSchema).optional(),
  tm_points: z.array(z.object({})).optional(),
  device: z.object({}).optional(),
  geofences: z.array(z.object({})).optional(),
});

export type WebRun = z.infer<typeof webRunSchema>;
export type WebInfo = z.infer<typeof webInfoSchema>;
export type WebRoutes = z.infer<typeof webRoutesSchema>;
