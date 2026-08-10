import type { AlertEventSpeedZone, AlertEventStatus, AlertEventType, AlertNotificationStatus } from "../../generated/prisma/client";
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
  vehicle: Readonly<{ id: string; name: string }>;
}>;

export type StoredAlertEventsPage = Readonly<{
  rows: readonly StoredAlertEventReadRow[];
  hasMore: boolean;
}>;

export type StoredOpenAlertEventsSummary = Readonly<{
  speeding: number;
  inactivity: number;
}>;

export const MAX_OPEN_ALERT_MAP_EVENTS = 1_000;

export type StoredOpenAlertMapRow = Readonly<{
  type: AlertEventType;
  confirmedAt: Date;
  vehicle: Readonly<{ id: string; name: string }>;
}>;

export type StoredOpenAlertMapSnapshot = Readonly<{
  rows: readonly StoredOpenAlertMapRow[];
  exceededLimit: boolean;
}>;

export interface AlertEventsQueryRepository {
  list(params: AlertEventsQueryParams): Promise<StoredAlertEventsPage>;
  getOpenSummary(): Promise<StoredOpenAlertEventsSummary>;
  getOpenMapSnapshot(): Promise<StoredOpenAlertMapSnapshot>;
}
