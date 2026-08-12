export type TripStopAnalyticsRange = Readonly<{ from: Date; to: Date }>;

export type TripStopAnalyticsObservation = Readonly<{
  observedAt: Date;
  fixFingerprint: string;
  latitude: number;
  longitude: number;
  speedKph: number | null;
  valid: boolean | null;
  outdated: boolean | null;
}>;

export type TripStopAnalyticsPosition = Readonly<{
  observedAt: Date;
  latitude: number;
  longitude: number;
}>;

export type DerivedTripTerminationReason = "STOP" | "DATA_GAP" | "RANGE_END";
export type DerivedStopTerminationReason = "MOVEMENT" | "DATA_GAP" | "RANGE_END";

export type DerivedTrip = Readonly<{
  startAt: Date;
  endAt: Date;
  durationSeconds: number;
  observedDistanceMeters: number;
  startPosition: TripStopAnalyticsPosition;
  endPosition: TripStopAnalyticsPosition;
  terminationReason: DerivedTripTerminationReason;
  startsAtRangeBoundary: boolean;
  endsAtRangeBoundary: boolean;
  observationCount: number;
}>;

export type DerivedStop = Readonly<{
  startAt: Date;
  endAt: Date;
  durationSeconds: number;
  startPosition: TripStopAnalyticsPosition;
  endPosition: TripStopAnalyticsPosition;
  terminationReason: DerivedStopTerminationReason;
  startsAtRangeBoundary: boolean;
  endsAtRangeBoundary: boolean;
  observationCount: number;
}>;

export type DerivedDataGap = Readonly<{
  fromObservedAt: Date;
  toObservedAt: Date;
  durationSeconds: number;
}>;

export type TripStopAnalyticsCoreResult = Readonly<{
  range: Readonly<{ from: Date; to: Date; inclusive: true }>;
  rawObservationCount: number;
  continuitySegmentCount: number;
  firstObservationAt: Date | null;
  lastObservationAt: Date | null;
  trips: readonly DerivedTrip[];
  stops: readonly DerivedStop[];
  gaps: readonly DerivedDataGap[];
  totalObservedTripDistanceMeters: number;
}>;

export type StoredTripStopAnalyticsSnapshot = Readonly<{
  vehicle: Readonly<{ id: string; name: string }> | null;
  observations: readonly TripStopAnalyticsObservation[];
}>;

export interface TripStopAnalyticsRepository {
  getSnapshot(vehicleId: string, range: TripStopAnalyticsRange): Promise<StoredTripStopAnalyticsSnapshot>;
}

export type TripStopAnalysisResult = Readonly<{
  vehicle: Readonly<{ id: string; name: string }>;
  range: Readonly<{ from: Date; to: Date; inclusive: true }>;
  summary: Readonly<{
    rawObservationCount: number;
    continuitySegmentCount: number;
    tripCount: number;
    stopCount: number;
    gapCount: number;
    totalObservedTripDistanceMeters: number;
    firstObservationAt: Date | null;
    lastObservationAt: Date | null;
  }>;
  trips: readonly DerivedTrip[];
  stops: readonly DerivedStop[];
  gaps: readonly DerivedDataGap[];
}>;

