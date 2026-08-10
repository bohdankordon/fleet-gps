import { z } from "zod";
import { parseVehicleTrackTimestamp, VEHICLE_TRACK_MAX_RANGE_MS } from "./vehicle-track-range";
import { vehicleTrackPointSchema } from "./vehicle-track-contract";

const timestamp = z.string().refine((value) => parseVehicleTrackTimestamp(value) !== null);
const count = z.number().int().nonnegative();
const overviewSegment = z.object({
  rawPointCount: count,
  firstObservedAt: timestamp,
  lastObservedAt: timestamp,
  points: z.array(vehicleTrackPointSchema).min(1).max(2_000),
}).strict().superRefine((segment, context) => {
  const first = Date.parse(segment.firstObservedAt); const last = Date.parse(segment.lastObservedAt);
  if (first > last) context.addIssue({ code: "custom", message: "segment boundary order" });
  if (segment.rawPointCount < segment.points.length) context.addIssue({ code: "custom", message: "segment raw count" });
  let previous = Number.NEGATIVE_INFINITY;
  for (const point of segment.points) {
    const observedAt = Date.parse(point.observedAt);
    if (observedAt < first || observedAt > last || observedAt < previous) context.addIssue({ code: "custom", message: "segment point order" });
    previous = observedAt;
  }
});

export const vehicleTrackOverviewResponseSchema = z.object({
  generatedAt: timestamp,
  vehicle: z.object({ id: z.string().uuid(), name: z.string().min(1).max(255) }).strict(),
  range: z.object({ from: timestamp, to: timestamp }).strict(),
  summary: z.object({
    rawPointCount: count,
    returnedPointCount: count.max(2_000),
    segmentCount: count.max(2_000),
    gapCount: count.max(1_999),
    qualityWarningCount: count,
    firstObservedAt: timestamp.nullable(),
    lastObservedAt: timestamp.nullable(),
    sampled: z.literal(true),
  }).strict(),
  segments: z.array(overviewSegment).max(2_000),
}).strict().superRefine((value, context) => {
  const rangeFrom = Date.parse(value.range.from); const rangeTo = Date.parse(value.range.to);
  if (rangeTo <= rangeFrom || rangeTo - rangeFrom > VEHICLE_TRACK_MAX_RANGE_MS) context.addIssue({ code: "custom", message: "range" });
  if (value.segments.length !== value.summary.segmentCount) context.addIssue({ code: "custom", message: "segment count" });
  const rawPointCount = value.segments.reduce((total, segment) => total + segment.rawPointCount, 0);
  const returnedPointCount = value.segments.reduce((total, segment) => total + segment.points.length, 0);
  if (rawPointCount !== value.summary.rawPointCount) context.addIssue({ code: "custom", message: "raw point count" });
  if (returnedPointCount !== value.summary.returnedPointCount) context.addIssue({ code: "custom", message: "returned point count" });
  if (value.summary.gapCount !== Math.max(value.summary.segmentCount - 1, 0)) context.addIssue({ code: "custom", message: "gap count" });
  if (value.summary.qualityWarningCount > value.summary.rawPointCount) context.addIssue({ code: "custom", message: "quality warning count" });

  const firstSegment = value.segments[0]; const lastSegment = value.segments.at(-1);
  const firstPoint = firstSegment?.points[0]?.observedAt ?? null;
  const lastPoint = lastSegment?.points.at(-1)?.observedAt ?? null;
  if (value.summary.firstObservedAt !== firstPoint || value.summary.lastObservedAt !== lastPoint) context.addIssue({ code: "custom", message: "selected boundary" });
  if ((firstSegment?.firstObservedAt ?? null) !== value.summary.firstObservedAt || (lastSegment?.lastObservedAt ?? null) !== value.summary.lastObservedAt) context.addIssue({ code: "custom", message: "raw boundary" });
  if (value.summary.firstObservedAt !== null && (Date.parse(value.summary.firstObservedAt) < rangeFrom || Date.parse(value.summary.lastObservedAt!) > rangeTo)) context.addIssue({ code: "custom", message: "summary range" });

  let previousPoint = Number.NEGATIVE_INFINITY; let previousSegmentLast = Number.NEGATIVE_INFINITY;
  for (const segment of value.segments) {
    const segmentFirst = Date.parse(segment.firstObservedAt); const segmentLast = Date.parse(segment.lastObservedAt);
    if (segmentFirst <= previousSegmentLast) context.addIssue({ code: "custom", message: "segment order" });
    for (const point of segment.points) {
      const observedAt = Date.parse(point.observedAt);
      if (observedAt < previousPoint) context.addIssue({ code: "custom", message: "global point order" });
      previousPoint = observedAt;
    }
    previousSegmentLast = segmentLast;
  }
});

export type VehicleTrackOverviewResponse = z.infer<typeof vehicleTrackOverviewResponseSchema>;
export type VehicleTrackOverviewSegment = z.infer<typeof overviewSegment>;
export class VehicleTrackOverviewContractError extends Error { public constructor() { super("Invalid vehicle-track overview response."); this.name = "VehicleTrackOverviewContractError"; } }
export function parseVehicleTrackOverviewResponse(value: unknown): VehicleTrackOverviewResponse {
  const parsed = vehicleTrackOverviewResponseSchema.safeParse(value);
  if (!parsed.success) throw new VehicleTrackOverviewContractError();
  return parsed.data;
}
