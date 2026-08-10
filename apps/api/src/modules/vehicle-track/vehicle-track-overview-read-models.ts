import type { VehicleTrackPointReadModel } from "./vehicle-track-read-models";

export type VehicleTrackOverviewSegmentReadModel = Readonly<{
  rawPointCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
  points: readonly VehicleTrackPointReadModel[];
}>;

export type VehicleTrackOverviewResponse = Readonly<{
  generatedAt: string;
  vehicle: Readonly<{ id: string; name: string }>;
  range: Readonly<{ from: string; to: string }>;
  summary: Readonly<{
    rawPointCount: number;
    returnedPointCount: number;
    segmentCount: number;
    gapCount: number;
    qualityWarningCount: number;
    firstObservedAt: string | null;
    lastObservedAt: string | null;
    sampled: true;
  }>;
  segments: readonly VehicleTrackOverviewSegmentReadModel[];
}>;
