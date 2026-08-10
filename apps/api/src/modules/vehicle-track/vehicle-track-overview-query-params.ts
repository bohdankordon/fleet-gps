import { parseAbsoluteTimestamp } from "./vehicle-track-query-params";

export const VEHICLE_TRACK_OVERVIEW_MAX_RANGE_MS = 7 * 24 * 60 * 60 * 1_000;

export type VehicleTrackOverviewRange = Readonly<{ from: Date; to: Date }>;

export function parseVehicleTrackOverviewRange(rawFrom: unknown, rawTo: unknown): VehicleTrackOverviewRange | null {
  const from = parseAbsoluteTimestamp(rawFrom);
  const to = parseAbsoluteTimestamp(rawTo);
  if (!from || !to) return null;
  const duration = to.getTime() - from.getTime();
  return duration > 0 && duration <= VEHICLE_TRACK_OVERVIEW_MAX_RANGE_MS ? Object.freeze({ from, to }) : null;
}
