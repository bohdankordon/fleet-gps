import type { AlertEventSpeedZone, AlertEventStatus, AlertEventType, AlertNotificationStatus } from "../../generated/prisma/client";
import type { VehicleScope } from "../vehicle-access/vehicle-access.types";
import type { VehicleGroupRef } from "../vehicle-access/vehicle-access.types";
import type { AlertEventsQueryParams } from "./alert-events-query-params";

export type StoredAlertEventProjectionRow = Readonly<{
  id: string;
  type: AlertEventType;
  status: AlertEventStatus;
  confirmedAt: Date;
  resolvedAt: Date | null;
  speedZone: AlertEventSpeedZone | null;
  confirmationSpeedKph: number | null;
  lastSpeedKph: number | null;
  peakSpeedKph: number | null;
  speedThresholdKph: number | null;
  confirmationTraveledDistanceMeters: number | null;
  lastTraveledDistanceMeters: number | null;
  minimumTraveledDistanceMeters: number | null;
  distanceThresholdMeters: number | null;
  durationThresholdMinutes: number | null;
  notificationOutbox: readonly Readonly<{ status: AlertNotificationStatus }>[];
}>;

export type StoredAlertEventReadRow = StoredAlertEventProjectionRow & Readonly<{
  lastObservedAt: Date;
  vehicle: Readonly<{ id: string; name: string; group: VehicleGroupRef | null }>;
}>;

export type StoredAlertEventsPage = Readonly<{
  rows: readonly StoredAlertEventReadRow[];
  hasMore: boolean;
}>;

export type StoredSpeedingEventInvestigationRow = Readonly<{
  id: string;
  type: AlertEventType;
  vehicleId: string;
  confirmedAt: Date;
  confirmationLatitude: number | null;
  confirmationLongitude: number | null;
  confirmationSpeedKph: number | null;
  speedThresholdKph: number | null;
  speedZone: AlertEventSpeedZone | null;
}>;

export type StoredOpenAlertEventsSummary = Readonly<{
  speeding: number;
  inactivity: number;
}>;

export const MAX_OPEN_ALERT_MAP_EVENTS = 1_000;

export type StoredOpenAlertMapRow = Readonly<{
  type: AlertEventType;
  confirmedAt: Date;
  vehicle: Readonly<{ id: string; name: string; group: VehicleGroupRef | null }>;
}>;

export type StoredOpenAlertMapSnapshot = Readonly<{
  rows: readonly StoredOpenAlertMapRow[];
  exceededLimit: boolean;
}>;

import type { AlertEventsVehicleOption } from "./alert-events-read-models";

export interface AlertEventsQueryRepository {
  getVehicleOptions(scope: VehicleScope): Promise<readonly AlertEventsVehicleOption[]>;
  list(params: AlertEventsQueryParams, scope: VehicleScope): Promise<StoredAlertEventsPage>;
  getOpenSummary(scope: VehicleScope): Promise<StoredOpenAlertEventsSummary>;
  getOpenMapSnapshot(scope: VehicleScope): Promise<StoredOpenAlertMapSnapshot>;
  findSpeedingInvestigation?(eventId: string, scope: VehicleScope): Promise<StoredSpeedingEventInvestigationRow | null>;
}
