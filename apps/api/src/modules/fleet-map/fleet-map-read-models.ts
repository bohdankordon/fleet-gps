import type { VehicleGroupRef } from "../vehicle-access/vehicle-access.types";

export type FleetMapPositionFreshness = "FRESH" | "STALE";

export type FleetMapVehicleReadModel = Readonly<{
  vehicle: Readonly<{ id: string; name: string; group: VehicleGroupRef | null }>;
  position: Readonly<{ latitude: number; longitude: number; observedAt: string }>;
  speedKph: number | null;
  freshness: FleetMapPositionFreshness;
}>;

export type FleetMapSummary = Readonly<{
  totalVehicles: number;
  withPosition: number;
  withoutPosition: number;
  invalidPosition: number;
  fresh: number;
  stale: number;
}>;

export type FleetMapResponse = Readonly<{
  generatedAt: string;
  positionFreshnessSeconds: number;
  summary: FleetMapSummary;
  vehicles: readonly FleetMapVehicleReadModel[];
}>;
