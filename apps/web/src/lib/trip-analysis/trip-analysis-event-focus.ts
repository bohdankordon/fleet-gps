import type { SpeedingEventInvestigation } from "../alert-events/alert-events-contract";
import type { TripAnalysisResponse } from "./trip-analysis-contract";
import { buildTripAnalysisTimeline } from "./trip-analysis-timeline";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ContainingTripResolution =
  | Readonly<{ kind: "MATCH"; tripKey: string }>
  | Readonly<{ kind: "NO_MATCH" }>
  | Readonly<{ kind: "AMBIGUOUS" }>;

export type VehicleTripsEventFocus =
  | Readonly<{ kind: "AVAILABLE"; event: SpeedingEventInvestigation; trip: ContainingTripResolution }>
  | Readonly<{ kind: "UNAVAILABLE" }>;

export const TRIP_EVENT_FOCUS_ZOOM = 15.25;
export function tripEventFocusCamera(position: Readonly<{ latitude: number; longitude: number }>): Readonly<{ center: readonly [number, number]; zoom: number }> {
  return Object.freeze({ center: Object.freeze([position.longitude, position.latitude] as const), zoom: TRIP_EVENT_FOCUS_ZOOM });
}

export function parseTripEventId(value: string | string[] | undefined): string | null {
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null;
}

/** Inclusive containment; only TRIP intervals are candidates and no nearest interval is considered. */
export function resolveContainingTrip(analysis: TripAnalysisResponse | null, confirmedAt: string): ContainingTripResolution {
  const instant = Date.parse(confirmedAt);
  if (!analysis || !Number.isFinite(instant)) return Object.freeze({ kind: "NO_MATCH" });
  const matches = buildTripAnalysisTimeline(analysis).filter((item) => item.kind === "TRIP" && Date.parse(item.startAt) <= instant && instant <= Date.parse(item.endAt));
  if (matches.length === 1) return Object.freeze({ kind: "MATCH", tripKey: matches[0]!.key });
  return Object.freeze({ kind: matches.length === 0 ? "NO_MATCH" : "AMBIGUOUS" });
}
