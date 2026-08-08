import type { VehicleStatus } from "../../generated/prisma/client";

export type FleetClock = { now(): Date };

export type FleetCurrentPosition = Readonly<{
  fixTime: Date | null;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  valid: boolean | null;
  outdated: boolean | null;
}>;

export type FleetSnapshotVehicle = Readonly<{
  externalDeviceId: number;
  name: string;
  disabled: boolean;
  status: VehicleStatus;
  externalLastUpdateAt: Date | null;
  fetchedAt: Date;
  position: FleetCurrentPosition | null;
}>;

export type FleetSnapshot = Readonly<{ vehicles: readonly FleetSnapshotVehicle[] }>;

export type FleetPersistedVehicleIdentity = Readonly<{
  externalDeviceId: number;
  vehicleId: string;
}>;

export type FleetPersistenceResult = Readonly<{
  vehiclesUpserted: number;
  currentStatesUpserted: number;
  persistedVehicleIdentities: readonly FleetPersistedVehicleIdentity[];
}>;

export type FleetAlertIngestionResult = Readonly<{
  alertCandidates: number;
  alertProcessed: number;
  alertAlreadyProcessed: number;
  alertSkipped: number;
}>;

export type FleetSyncResult = Readonly<{
  devicesReceived: number;
  positionsReceived: number;
  vehiclesUpserted: number;
  currentStatesUpserted: number;
  devicesWithoutPosition: number;
  unmatchedPositions: number;
  duplicatePositions: number;
  invalidDeviceLastUpdateDates: number;
  invalidPositionFixDates: number;
  alertCandidates: number;
  alertProcessed: number;
  alertAlreadyProcessed: number;
  alertSkipped: number;
  fetchedAt: string;
}>;
