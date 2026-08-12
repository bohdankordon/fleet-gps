import { z } from "zod";
import { parseVehicleTrackTimestamp, VEHICLE_TRACK_MAX_RANGE_MS } from "../vehicle-track/vehicle-track-range";

const timestamp = z.string().refine((value) => parseVehicleTrackTimestamp(value) !== null);
const count = z.number().int().nonnegative(); const coordinate = z.number().finite();
const position = z.object({ latitude: coordinate.min(-90).max(90), longitude: coordinate.min(-180).max(180), observedAt: timestamp }).strict();
const trip = z.object({ startAt: timestamp, endAt: timestamp, durationSeconds: z.number().finite().nonnegative(), observedDistanceMeters: z.number().finite().nonnegative(), startPosition: position, endPosition: position, observationCount: count, terminationReason: z.enum(["STOP", "DATA_GAP", "RANGE_END"]), endClipped: z.boolean() }).strict();
const stop = z.object({ startAt: timestamp, endAt: timestamp, durationSeconds: z.number().finite().nonnegative(), startPosition: position, endPosition: position, observationCount: count, terminationReason: z.enum(["MOVEMENT", "DATA_GAP", "RANGE_END"]), endClipped: z.boolean() }).strict();
const gap = z.object({ fromObservedAt: timestamp, toObservedAt: timestamp, durationSeconds: z.number().finite().positive() }).strict();

export const tripAnalysisResponseSchema = z.object({
  vehicleId: z.string().uuid(), from: timestamp, to: timestamp,
  summary: z.object({ tripCount: count, stopCount: count, gapCount: count, totalObservedDistanceMeters: z.number().finite().nonnegative(), rawObservationCount: count, firstObservationAt: timestamp.nullable(), lastObservationAt: timestamp.nullable() }).strict(),
  trips: z.array(trip), stops: z.array(stop), gaps: z.array(gap),
}).strict().superRefine((value, context) => {
  const from = Date.parse(value.from); const to = Date.parse(value.to);
  if (to <= from || to - from > VEHICLE_TRACK_MAX_RANGE_MS) context.addIssue({ code: "custom", message: "range" });
  if (value.summary.tripCount !== value.trips.length || value.summary.stopCount !== value.stops.length || value.summary.gapCount !== value.gaps.length) context.addIssue({ code: "custom", message: "count" });
  if ((value.summary.rawObservationCount === 0) !== (value.summary.firstObservationAt === null && value.summary.lastObservationAt === null)) context.addIssue({ code: "custom", message: "observation boundaries" });
  for (const item of [...value.trips, ...value.stops]) {
    if (item.endClipped !== (item.terminationReason === "RANGE_END")) context.addIssue({ code: "custom", message: "clipping" });
    if (item.startAt !== item.startPosition.observedAt || item.endAt !== item.endPosition.observedAt) context.addIssue({ code: "custom", message: "event positions" });
    if ((Date.parse(item.endAt) - Date.parse(item.startAt)) / 1_000 !== item.durationSeconds) context.addIssue({ code: "custom", message: "duration" });
  }
});

export type TripAnalysisResponse = z.infer<typeof tripAnalysisResponseSchema>;
export type TripAnalysisTrip = TripAnalysisResponse["trips"][number];
export type TripAnalysisStop = TripAnalysisResponse["stops"][number];
export type TripAnalysisGap = TripAnalysisResponse["gaps"][number];
export class TripAnalysisContractError extends Error { public constructor() { super("Invalid trip-analysis response."); this.name = "TripAnalysisContractError"; } }
export function parseTripAnalysisResponse(value: unknown): TripAnalysisResponse { const parsed = tripAnalysisResponseSchema.safeParse(value); if (!parsed.success) throw new TripAnalysisContractError(); return parsed.data; }
export function isTripAnalysisVehicleId(value: string): boolean { return z.string().uuid().safeParse(value).success; }

