import { parseVehicleTrackTimestamp } from "../vehicle-track/vehicle-track-range";

export type AlertEventsStatus = "OPEN" | "RESOLVED";
export type AlertEventsType = "SPEEDING" | "INACTIVITY";
export type AlertEventsMode = "active" | "history";
export type AlertEventsPeriod = "24h" | "7d" | "30d" | "custom";
export type AlertEventsFilters = Readonly<{ mode?: AlertEventsMode; status?: AlertEventsStatus; type?: AlertEventsType; vehicleId?: string; period?: AlertEventsPeriod; from?: string; to?: string }>;
export type AlertEventsRequestQuery = AlertEventsFilters & Readonly<{ limit: number; cursor?: string }>;
export const ALERT_EVENTS_PAGE_SIZE = 25;
export const MAX_ALERT_EVENTS_PAGE_SIZE = 100;
export class AlertEventsQueryError extends Error { public constructor() { super("Invalid alert-events filters."); this.name = "AlertEventsQueryError"; } }

function parseStatus(value: string | null): AlertEventsStatus | undefined { if (value === null) return undefined; if (value === "OPEN" || value === "RESOLVED") return value; throw new AlertEventsQueryError(); }
function parseType(value: string | null): AlertEventsType | undefined { if (value === null) return undefined; if (value === "SPEEDING" || value === "INACTIVITY") return value; throw new AlertEventsQueryError(); }
function parseLimit(value: string | null): number { if (value === null) return ALERT_EVENTS_PAGE_SIZE; if (!/^[1-9][0-9]*$/.test(value)) throw new AlertEventsQueryError(); const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed > MAX_ALERT_EVENTS_PAGE_SIZE) throw new AlertEventsQueryError(); return parsed; }
function parseCursor(value: string | null): string | undefined { if (value === null) return undefined; if (value.length === 0 || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new AlertEventsQueryError(); return value; }
function parseVehicle(value: string | null): string | undefined { if (value === null) return undefined; if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new AlertEventsQueryError(); return value; }
export function parseAlertEventsRange(fromValue: string | null, toValue: string | null): Readonly<{ from?: string; to?: string }> {
  const from = fromValue === null ? undefined : parseVehicleTrackTimestamp(fromValue);
  const to = toValue === null ? undefined : parseVehicleTrackTimestamp(toValue);
  if (from === null || to === null || (from && to && from >= to)) throw new AlertEventsQueryError();
  return { ...(from ? { from: from.toISOString() } : {}), ...(to ? { to: to.toISOString() } : {}) };
}
export function alertEventsPreset(period: Exclude<AlertEventsPeriod, "custom">, now = new Date()): Pick<AlertEventsFilters, "period" | "from" | "to"> {
  const hours = period === "24h" ? 24 : period === "30d" ? 720 : 168;
  return { period, from: new Date(now.getTime() - hours * 3600000).toISOString(), to: now.toISOString() };
}
export function alertEventsMode(filters: AlertEventsFilters): AlertEventsMode { return filters.mode ?? (filters.status === "RESOLVED" ? "history" : "active"); }
export function switchAlertEventsMode(filters: AlertEventsFilters, mode: AlertEventsMode, now = new Date()): AlertEventsFilters {
  return { mode, status: mode === "active" ? "OPEN" : "RESOLVED", type: filters.type, vehicleId: filters.vehicleId, ...(mode === "history" ? alertEventsPreset("7d", now) : {}) };
}
export function parseAlertEventsFilters(params: URLSearchParams, now = new Date()): AlertEventsFilters {
  const status = parseStatus(params.get("status")); const rawMode = params.get("mode");
  if (rawMode !== null && rawMode !== "active" && rawMode !== "history") throw new AlertEventsQueryError();
  const mode = rawMode ?? (status === "RESOLVED" ? "history" : "active");
  const common = { mode, status: mode === "active" ? "OPEN" : "RESOLVED", type: parseType(params.get("type")), vehicleId: parseVehicle(params.get("vehicleId")) } as const;
  if (mode === "active") return common;
  const period = params.get("period") ?? (params.has("from") || params.has("to") ? "custom" : "7d");
  if (!["24h", "7d", "30d", "custom"].includes(period)) throw new AlertEventsQueryError();
  if (params.has("from") || params.has("to") || period === "custom") {
    const range = parseAlertEventsRange(params.get("from"), params.get("to"));
    if (!range.from || !range.to) throw new AlertEventsQueryError();
    return { ...common, period: period as AlertEventsPeriod, ...range };
  }
  return { ...common, ...alertEventsPreset(period as Exclude<AlertEventsPeriod, "custom">, now) };
}
export function parseAlertEventsRequestQuery(params: URLSearchParams): AlertEventsRequestQuery {
  for (const key of ["status", "type", "vehicleId", "from", "to", "limit", "cursor"]) if (params.getAll(key).length > 1) throw new AlertEventsQueryError();
  return { status: parseStatus(params.get("status")), type: parseType(params.get("type")), ...(params.has("vehicleId") ? { vehicleId: parseVehicle(params.get("vehicleId")) } : {}), ...parseAlertEventsRange(params.get("from"), params.get("to")), limit: parseLimit(params.get("limit")), cursor: parseCursor(params.get("cursor")) };
}
export function serializeAlertEventsFilters(filters: AlertEventsFilters): string {
  const params = new URLSearchParams({ mode: alertEventsMode(filters) });
  if (filters.type) params.set("type", filters.type);
  if (filters.vehicleId) params.set("vehicleId", filters.vehicleId);
  if (alertEventsMode(filters) === "history") for (const key of ["period", "from", "to"] as const) if (filters[key]) params.set(key, filters[key]);
  return params.toString();
}
export function serializeAlertEventsRequestQuery(query: AlertEventsRequestQuery): string {
  const params = new URLSearchParams();
  for (const key of ["status", "type", "vehicleId", "from", "to"] as const) if (query[key] && !(query.mode === "active" && (key === "from" || key === "to"))) params.set(key, query[key]);
  params.set("limit", String(query.limit)); if (query.cursor) params.set("cursor", query.cursor); return params.toString();
}
