import type { AlertEvent } from "./alert-events-contract";
import { hasPermission, type AuthUser } from "../auth/auth-contract";
import { parseVehicleTrackRange } from "../vehicle-track/vehicle-track-range";
import { tripAnalysisPageQuery } from "../trip-analysis/trip-analysis-range";

/** A navigation convenience around confirmation, never the episode duration or origin. */
export function alertEventInvestigationRange(openedAt: string, now: Date) {
  const opened = Date.parse(openedAt);
  if (!Number.isFinite(opened) || !Number.isFinite(now.getTime())) return null;
  return parseVehicleTrackRange(new Date(opened - 30 * 60_000).toISOString(), new Date(Math.min(opened + 90 * 60_000, now.getTime())).toISOString());
}
export function alertEventActions(event: AlertEvent, user: AuthUser | null, now: Date) {
  const actions: { key: "vehicle" | "track" | "trips" | "eventTrip" | "position"; href: string }[] = [];
  if (!user) return actions;
  const base = `/vehicles/${event.vehicle.id}`;
  if (hasPermission(user, "vehicles.view")) actions.push({ key: "vehicle", href: base });
  const range = alertEventInvestigationRange(event.openedAt, now);
  if (range && hasPermission(user, "trips.view")) {
    const query = tripAnalysisPageQuery(range, false);
    if (event.type === "SPEEDING") actions.push({ key: "eventTrip", href: `${base}/trips?${query}&event=${encodeURIComponent(event.id)}` });
    actions.push({ key: "track", href: `${base}/track?${query}` }, { key: "trips", href: `${base}/trips?${query}` });
  }
  if (hasPermission(user, "map.view")) actions.push({ key: "position", href: `/map?vehicleId=${event.vehicle.id}` });
  return actions;
}
