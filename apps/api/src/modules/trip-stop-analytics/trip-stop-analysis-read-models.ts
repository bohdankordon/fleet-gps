import type { DerivedStopTerminationReason, DerivedTripTerminationReason, TripStopAnalysisResult } from "./trip-stop-analytics.types";

export type TripAnalysisPositionDto = Readonly<{ latitude: number; longitude: number; observedAt: string }>;
export type TripAnalysisTripDto = Readonly<{ startAt: string; endAt: string; durationSeconds: number; observedDistanceMeters: number; startPosition: TripAnalysisPositionDto; endPosition: TripAnalysisPositionDto; observationCount: number; terminationReason: DerivedTripTerminationReason; endClipped: boolean }>;
export type TripAnalysisStopDto = Readonly<{ startAt: string; endAt: string; durationSeconds: number; startPosition: TripAnalysisPositionDto; endPosition: TripAnalysisPositionDto; observationCount: number; terminationReason: DerivedStopTerminationReason; endClipped: boolean }>;
export type TripAnalysisGapDto = Readonly<{ fromObservedAt: string; toObservedAt: string; durationSeconds: number }>;
export type TripAnalysisResponse = Readonly<{
  vehicleId: string; from: string; to: string;
  summary: Readonly<{ tripCount: number; stopCount: number; gapCount: number; totalObservedDistanceMeters: number; rawObservationCount: number; firstObservationAt: string | null; lastObservationAt: string | null }>;
  trips: readonly TripAnalysisTripDto[]; stops: readonly TripAnalysisStopDto[]; gaps: readonly TripAnalysisGapDto[];
}>;

function instant(value: Date): string { return value.toISOString(); }
function position(value: Readonly<{ latitude: number; longitude: number; observedAt: Date }>): TripAnalysisPositionDto { return Object.freeze({ latitude: value.latitude, longitude: value.longitude, observedAt: instant(value.observedAt) }); }

export function toTripAnalysisResponse(result: TripStopAnalysisResult): TripAnalysisResponse {
  return Object.freeze({
    vehicleId: result.vehicle.id, from: instant(result.range.from), to: instant(result.range.to),
    summary: Object.freeze({ tripCount: result.summary.tripCount, stopCount: result.summary.stopCount, gapCount: result.summary.gapCount, totalObservedDistanceMeters: result.summary.totalObservedTripDistanceMeters, rawObservationCount: result.summary.rawObservationCount, firstObservationAt: result.summary.firstObservationAt?.toISOString() ?? null, lastObservationAt: result.summary.lastObservationAt?.toISOString() ?? null }),
    trips: Object.freeze(result.trips.map((trip) => Object.freeze({ startAt: instant(trip.startAt), endAt: instant(trip.endAt), durationSeconds: trip.durationSeconds, observedDistanceMeters: trip.observedDistanceMeters, startPosition: position(trip.startPosition), endPosition: position(trip.endPosition), observationCount: trip.observationCount, terminationReason: trip.terminationReason, endClipped: trip.terminationReason === "RANGE_END" }))),
    stops: Object.freeze(result.stops.map((stop) => Object.freeze({ startAt: instant(stop.startAt), endAt: instant(stop.endAt), durationSeconds: stop.durationSeconds, startPosition: position(stop.startPosition), endPosition: position(stop.endPosition), observationCount: stop.observationCount, terminationReason: stop.terminationReason, endClipped: stop.terminationReason === "RANGE_END" }))),
    gaps: Object.freeze(result.gaps.map((gap) => Object.freeze({ fromObservedAt: instant(gap.fromObservedAt), toObservedAt: instant(gap.toObservedAt), durationSeconds: gap.durationSeconds }))),
  });
}

