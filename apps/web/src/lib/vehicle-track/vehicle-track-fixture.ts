import type { VehicleTrackPoint, VehicleTrackResponse } from "./vehicle-track-contract";
import type { VehicleTrackOverviewResponse, VehicleTrackOverviewSegment } from "./vehicle-track-overview-contract";
export const TRACK_VEHICLE_ID = "00000000-0000-4000-8000-000000000001";
export function trackPoint(observedAt = "2026-08-10T10:00:00.000Z", overrides: Partial<VehicleTrackPoint> = {}): VehicleTrackPoint { return { latitude: 49.2, longitude: 28.4, observedAt, speedKph: null, valid: null, outdated: null, ...overrides }; }
export function trackFixture(points: readonly VehicleTrackPoint[] = []): VehicleTrackResponse { return { generatedAt: "2026-08-10T12:00:00.000Z", vehicle: { id: TRACK_VEHICLE_ID, name: "Taxi", group: null }, range: { from: "2026-08-10T09:00:00.000Z", to: "2026-08-10T12:00:00.000Z" }, summary: { pointCount: points.length, firstObservedAt: points[0]?.observedAt ?? null, lastObservedAt: points.at(-1)?.observedAt ?? null }, points: [...points] }; }
export function overviewSegment(points: readonly VehicleTrackPoint[], rawPointCount = points.length, firstObservedAt = points[0]?.observedAt ?? "2026-08-01T00:00:00.000Z", lastObservedAt = points.at(-1)?.observedAt ?? firstObservedAt): VehicleTrackOverviewSegment { return { rawPointCount, firstObservedAt, lastObservedAt, points: [...points] }; }
export function overviewTrackFixture(segments: readonly VehicleTrackOverviewSegment[] = [], qualityWarningCount = 0): VehicleTrackOverviewResponse {
  const points = segments.flatMap((segment) => segment.points);
  return {
    generatedAt: "2026-08-10T12:00:00.000Z",
    vehicle: { id: TRACK_VEHICLE_ID, name: "Taxi", group: null },
    range: { from: "2026-08-01T00:00:00.000Z", to: "2026-08-04T00:00:00.000Z" },
    summary: {
      rawPointCount: segments.reduce((total, segment) => total + segment.rawPointCount, 0),
      returnedPointCount: points.length,
      segmentCount: segments.length,
      gapCount: Math.max(segments.length - 1, 0),
      qualityWarningCount,
      firstObservedAt: points[0]?.observedAt ?? null,
      lastObservedAt: points.at(-1)?.observedAt ?? null,
      sampled: true,
    },
    segments: [...segments],
  };
}
