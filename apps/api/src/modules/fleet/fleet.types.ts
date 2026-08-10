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

export type FleetPositionObservation = Readonly<{
  externalDeviceId: number;
  observedAt: Date | null;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  valid: boolean | null;
  outdated: boolean | null;
  fetchedAt: Date;
}>;

export type FleetSnapshot = Readonly<{
  vehicles: readonly FleetSnapshotVehicle[];
  positionObservations: readonly FleetPositionObservation[];
}>;

export type FleetPersistedVehicleIdentity = Readonly<{
  externalDeviceId: number;
  vehicleId: string;
}>;

export type FleetPersistenceResult = Readonly<{
  vehiclesUpserted: number;
  currentStatesUpserted: number;
  historyCandidates: number;
  historyInserted: number;
  historyDuplicates: number;
  historySkippedInvalid: number;
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
  historyCandidates: number;
  historyInserted: number;
  historyDuplicates: number;
  historySkippedInvalid: number;
  alertCandidates: number;
  alertProcessed: number;
  alertAlreadyProcessed: number;
  alertSkipped: number;
  fetchedAt: string;
}>;
