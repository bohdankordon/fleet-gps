import type { AlertEventStatus, AlertEventType } from "./alert-events.types";

export const DEFAULT_ALERT_EVENTS_PAGE_SIZE = 50;
export const MAX_ALERT_EVENTS_PAGE_SIZE = 100;

export type AlertEventsCursor = Readonly<{ openedAt: Date; id: string }>;
export type AlertEventsQueryParams = Readonly<{
  status: AlertEventStatus | undefined;
  type: AlertEventType | undefined;
  vehicleId: string | undefined;
  limit: number;
  cursor: AlertEventsCursor | undefined;
}>;

export class AlertEventsQueryParamsError extends Error {
  public constructor() {
    super("Invalid alert events query.");
    this.name = "AlertEventsQueryParamsError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURSOR = /^[A-Za-z0-9_-]+$/;

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new AlertEventsQueryParamsError();
  return value;
}

function parseLimit(value: unknown): number {
  const raw = optionalString(value);
  if (raw === undefined) return DEFAULT_ALERT_EVENTS_PAGE_SIZE;
  if (!/^[1-9][0-9]*$/.test(raw)) throw new AlertEventsQueryParamsError();
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_ALERT_EVENTS_PAGE_SIZE) throw new AlertEventsQueryParamsError();
  return parsed;
}

function parseCursor(value: unknown): AlertEventsCursor | undefined {
  const raw = optionalString(value);
  if (raw === undefined) return undefined;
  if (raw.length === 0 || raw.length > 512 || !CURSOR.test(raw)) throw new AlertEventsQueryParamsError();
  try {
    const decoded: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof decoded !== "object" || decoded === null) throw new AlertEventsQueryParamsError();
    const values = decoded as Readonly<Record<string, unknown>>;
    if (Object.keys(values).length !== 2 || typeof values.openedAt !== "string" || typeof values.id !== "string" || !UUID.test(values.id)) throw new AlertEventsQueryParamsError();
    const openedAt = new Date(values.openedAt);
    if (!Number.isFinite(openedAt.getTime()) || openedAt.toISOString() !== values.openedAt) throw new AlertEventsQueryParamsError();
    return Object.freeze({ openedAt, id: values.id });
  } catch (error) {
    if (error instanceof AlertEventsQueryParamsError) throw error;
    throw new AlertEventsQueryParamsError();
  }
}

export function encodeAlertEventsCursor(cursor: AlertEventsCursor): string {
  return Buffer.from(JSON.stringify({ openedAt: cursor.openedAt.toISOString(), id: cursor.id }), "utf8").toString("base64url");
}

export function parseAlertEventsQueryParams(query: Readonly<Record<string, unknown>>): AlertEventsQueryParams {
  const status = optionalString(query.status);
  if (status !== undefined && status !== "OPEN" && status !== "RESOLVED") throw new AlertEventsQueryParamsError();
  const type = optionalString(query.type);
  if (type !== undefined && type !== "SPEEDING" && type !== "INACTIVITY") throw new AlertEventsQueryParamsError();
  const vehicleId = optionalString(query.vehicleId);
  if (vehicleId !== undefined && !UUID.test(vehicleId)) throw new AlertEventsQueryParamsError();
  return Object.freeze({ status, type, vehicleId, limit: parseLimit(query.limit), cursor: parseCursor(query.cursor) });
}
