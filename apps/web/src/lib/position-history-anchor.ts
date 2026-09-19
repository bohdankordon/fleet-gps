import { parseVehicleTrackTimestamp } from "./vehicle-track/vehicle-track-range";

export type PositionHistoryAnchorResolution = Readonly<{ anchor: string | null; input: string; absent: boolean }>;

/** Manual population plans one explicit historical horizon, so its `to` anchor always comes from URL state. */
export function resolvePositionHistoryAnchor(searchParams: Readonly<Record<string, string | string[] | undefined>>): PositionHistoryAnchorResolution {
  const raw = searchParams.to;
  if (raw === undefined) return Object.freeze({ anchor: null, input: "", absent: true });
  if (typeof raw !== "string") return Object.freeze({ anchor: null, input: "", absent: false });
  if (!parseVehicleTrackTimestamp(raw)) return Object.freeze({ anchor: null, input: raw, absent: false });
  return Object.freeze({ anchor: raw, input: raw, absent: false });
}
