import type { SpeedLimitZone } from "../city-geofence";

export type AlertEventType = "SPEEDING" | "INACTIVITY";
export type AlertEventStatus = "OPEN" | "RESOLVED";
export type AlertEventSpeedZone = Exclude<SpeedLimitZone, "UNKNOWN">;

export type OpenSpeedingEventCommand = Readonly<{
  type: "SPEEDING";
  vehicleId: string;
  observedAt: Date;
  zone: AlertEventSpeedZone;
  speedKph: number;
  speedThresholdKph: number;
}>;

export type OpenInactivityEventCommand = Readonly<{
  type: "INACTIVITY";
  vehicleId: string;
  observedAt: Date;
  traveledDistanceMeters: number;
  distanceThresholdMeters: number;
  durationThresholdMinutes: number;
}>;

export type OpenAlertEventCommand = OpenSpeedingEventCommand | OpenInactivityEventCommand;

export type UpdateSpeedingEventCommand = Readonly<{
  type: "SPEEDING";
  vehicleId: string;
  observedAt: Date;
  speedKph: number;
}>;

export type UpdateInactivityEventCommand = Readonly<{
  type: "INACTIVITY";
  vehicleId: string;
  observedAt: Date;
  traveledDistanceMeters: number;
}>;

export type UpdateAlertEventCommand = UpdateSpeedingEventCommand | UpdateInactivityEventCommand;
export type ResolveAlertEventCommand = UpdateAlertEventCommand;

export type AlertEventPersistenceAction =
  | Readonly<{ kind: "NONE" }>
  | Readonly<{ kind: "OPEN"; command: OpenAlertEventCommand }>
  | Readonly<{ kind: "UPDATE"; command: UpdateAlertEventCommand }>
  | Readonly<{ kind: "RESOLVE"; command: ResolveAlertEventCommand }>;

type AlertEventRecordBase = Readonly<{
  id: string;
  vehicleId: string;
  status: AlertEventStatus;
  confirmedAt: Date;
  lastObservedAt: Date;
  resolvedAt: Date | null;
  dedupeKey: string;
  activeKey: string | null;
}>;

export type SpeedingAlertEventRecord = AlertEventRecordBase & Readonly<{
  type: "SPEEDING";
  speedZone: AlertEventSpeedZone;
  confirmationSpeedKph: number;
  lastSpeedKph: number;
  peakSpeedKph: number;
  speedThresholdKph: number;
}>;

export type InactivityAlertEventRecord = AlertEventRecordBase & Readonly<{
  type: "INACTIVITY";
  confirmationTraveledDistanceMeters: number;
  lastTraveledDistanceMeters: number;
  minimumTraveledDistanceMeters: number;
  distanceThresholdMeters: number;
  durationThresholdMinutes: number;
}>;

export type AlertEventRecord = SpeedingAlertEventRecord | InactivityAlertEventRecord;

export type AlertEventNoopReason = "MISSING_OPEN_EVENT" | "STALE";

export type AlertEventLifecycleResult =
  | Readonly<{ outcome: "CREATED"; eventId: string }>
  | Readonly<{ outcome: "ALREADY_EXISTS"; eventId: string }>
  | Readonly<{ outcome: "ALREADY_OPEN"; eventId: string; updated: boolean }>
  | Readonly<{ outcome: "UPDATED"; eventId: string }>
  | Readonly<{ outcome: "RESOLVED"; eventId: string }>
  | Readonly<{ outcome: "NOOP"; reason: AlertEventNoopReason }>;

