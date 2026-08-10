export type VehicleTrackPointReadModel = Readonly<{
  latitude: number;
  longitude: number;
  observedAt: string;
  speedKph: number | null;
  valid: boolean | null;
  outdated: boolean | null;
}>;

export type VehicleTrackResponse = Readonly<{
  generatedAt: string;
  vehicle: Readonly<{ id: string; name: string }>;
  range: Readonly<{ from: string; to: string }>;
  summary: Readonly<{ pointCount: number; firstObservedAt: string | null; lastObservedAt: string | null }>;
  points: readonly VehicleTrackPointReadModel[];
}>;
