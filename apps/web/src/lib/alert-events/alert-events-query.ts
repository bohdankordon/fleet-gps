export type AlertEventsStatus = "OPEN" | "RESOLVED";
export type AlertEventsType = "SPEEDING" | "INACTIVITY";
export type AlertEventsFilters = Readonly<{ status?: AlertEventsStatus; type?: AlertEventsType }>;
export type AlertEventsRequestQuery = AlertEventsFilters & Readonly<{ limit: number; cursor?: string }>;
export const ALERT_EVENTS_PAGE_SIZE = 25;
export const MAX_ALERT_EVENTS_PAGE_SIZE = 100;
export class AlertEventsQueryError extends Error { public constructor() { super("Invalid alert-events filters."); this.name = "AlertEventsQueryError"; } }

const allowed = new Set(["status", "type", "limit", "cursor"]);
function parseStatus(value: string | null): AlertEventsStatus | undefined { if (value === null) return undefined; if (value === "OPEN" || value === "RESOLVED") return value; throw new AlertEventsQueryError(); }
function parseType(value: string | null): AlertEventsType | undefined { if (value === null) return undefined; if (value === "SPEEDING" || value === "INACTIVITY") return value; throw new AlertEventsQueryError(); }
function parseLimit(value: string | null): number { if (value === null) return ALERT_EVENTS_PAGE_SIZE; if (!/^[1-9][0-9]*$/.test(value)) throw new AlertEventsQueryError(); const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed > MAX_ALERT_EVENTS_PAGE_SIZE) throw new AlertEventsQueryError(); return parsed; }
function parseCursor(value: string | null): string | undefined { if (value === null) return undefined; if (value.length === 0 || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new AlertEventsQueryError(); return value; }

export function parseAlertEventsFilters(params: URLSearchParams): AlertEventsFilters { return Object.freeze({ status: parseStatus(params.get("status")), type: parseType(params.get("type")) }); }
export function parseAlertEventsRequestQuery(params: URLSearchParams): AlertEventsRequestQuery { for (const key of params.keys()) if (!allowed.has(key)) continue; return Object.freeze({ ...parseAlertEventsFilters(params), limit: parseLimit(params.get("limit")), cursor: parseCursor(params.get("cursor")) }); }
export function serializeAlertEventsFilters(filters: AlertEventsFilters): string { const params = new URLSearchParams(); if (filters.status) params.set("status", filters.status); if (filters.type) params.set("type", filters.type); return params.toString(); }
export function serializeAlertEventsRequestQuery(query: AlertEventsRequestQuery): string { const params = new URLSearchParams(serializeAlertEventsFilters(query)); params.set("limit", String(query.limit)); if (query.cursor) params.set("cursor", query.cursor); return params.toString(); }
