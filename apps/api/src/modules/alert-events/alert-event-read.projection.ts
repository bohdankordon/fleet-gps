import { AlertEventSpeedZone, AlertEventType, AlertNotificationStatus } from "../../generated/prisma/client";
import type { AlertNotificationDeliveryStatus, InactivityAlertDetails, SpeedingAlertDetails } from "./alert-events-read-models";
import type { StoredAlertEventProjectionRow } from "./alert-events-query.repository";

export class AlertEventReadProjectionError extends Error {
  public constructor() {
    super("Invalid persisted alert event read state.");
    this.name = "AlertEventReadProjectionError";
  }
}

export type ScopedAlertEventReadModel = Readonly<{
  id: string;
  status: "OPEN" | "RESOLVED";
  openedAt: string;
  resolvedAt: string | null;
  notificationDeliveryStatus: AlertNotificationDeliveryStatus;
}> & (
  | Readonly<{ type: "SPEEDING"; details: SpeedingAlertDetails }>
  | Readonly<{ type: "INACTIVITY"; details: InactivityAlertDetails }>
);

function finite(value: number | null): number {
  if (value === null || !Number.isFinite(value)) throw new AlertEventReadProjectionError();
  return value;
}

function positiveInteger(value: number | null): number {
  if (value === null || !Number.isInteger(value) || value <= 0) throw new AlertEventReadProjectionError();
  return value;
}

export function projectAlertNotificationDeliveryStatus(row: StoredAlertEventProjectionRow): AlertNotificationDeliveryStatus {
  const status = row.notificationOutbox[0]?.status;
  if (status === undefined) return "NONE";
  if (status === AlertNotificationStatus.PENDING || status === AlertNotificationStatus.SENDING) return "PENDING";
  if (status === AlertNotificationStatus.SENT) return "SENT";
  if (status === AlertNotificationStatus.FAILED) return "FAILED";
  throw new AlertEventReadProjectionError();
}

export function projectAlertEventTimestamp(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new AlertEventReadProjectionError();
  return value.toISOString();
}

export function projectScopedAlertEvent(row: StoredAlertEventProjectionRow): ScopedAlertEventReadModel {
  const common = {
    id: row.id,
    status: row.status,
    openedAt: projectAlertEventTimestamp(row.confirmedAt),
    resolvedAt: row.resolvedAt === null ? null : projectAlertEventTimestamp(row.resolvedAt),
    notificationDeliveryStatus: projectAlertNotificationDeliveryStatus(row),
  } as const;
  if (row.type === AlertEventType.SPEEDING) {
    if (row.speedZone !== AlertEventSpeedZone.CITY && row.speedZone !== AlertEventSpeedZone.OUTSIDE_CITY) throw new AlertEventReadProjectionError();
    return Object.freeze({ ...common, type: "SPEEDING", details: Object.freeze({ zone: row.speedZone, confirmationSpeedKph: finite(row.confirmationSpeedKph), lastSpeedKph: finite(row.lastSpeedKph), peakSpeedKph: finite(row.peakSpeedKph), thresholdKph: finite(row.speedThresholdKph) }) });
  }
  if (row.type === AlertEventType.INACTIVITY) {
    return Object.freeze({ ...common, type: "INACTIVITY", details: Object.freeze({ confirmationDistanceMeters: finite(row.confirmationTraveledDistanceMeters), lastDistanceMeters: finite(row.lastTraveledDistanceMeters), minimumDistanceMeters: finite(row.minimumTraveledDistanceMeters), distanceThresholdMeters: finite(row.distanceThresholdMeters), durationThresholdMinutes: positiveInteger(row.durationThresholdMinutes) }) });
  }
  throw new AlertEventReadProjectionError();
}

export function projectOpenAlert(type: AlertEventType, confirmedAt: Date): Readonly<{ type: "SPEEDING" | "INACTIVITY"; openedAt: string }> {
  if (type !== AlertEventType.SPEEDING && type !== AlertEventType.INACTIVITY) throw new AlertEventReadProjectionError();
  return Object.freeze({ type, openedAt: projectAlertEventTimestamp(confirmedAt) });
}
