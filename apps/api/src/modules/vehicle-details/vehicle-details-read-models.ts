import type { ScopedAlertEventReadModel } from "../alert-events/alert-event-read.projection";
import type { FleetMapCurrentStateProjection } from "../fleet-map/fleet-map-current-state.projection";

export const RECENT_VEHICLE_ALERT_EVENTS_LIMIT = 10;

export type VehicleDetailsTodayReadModel = Readonly<{
  date: string;
  distanceMeters: number;
  movementDurationSeconds: number | null;
  maxSpeedKph: number | null;
  source: "RUNS" | "MODE1" | "HISTORICAL_POSITIONS";
  quality: "EXACT" | "PROVISIONAL" | "ESTIMATED";
  isStale: boolean;
  isDegraded: boolean;
}>;

export type VehicleDetailsResponse = Readonly<{
  generatedAt: string;
  vehicle: Readonly<{ id: string; name: string }>;
  currentState: FleetMapCurrentStateProjection | null;
  today: VehicleDetailsTodayReadModel | null;
  activeAlerts: readonly Readonly<{ type: "SPEEDING" | "INACTIVITY"; openedAt: string }>[];
  recentEvents: readonly ScopedAlertEventReadModel[];
}>;
