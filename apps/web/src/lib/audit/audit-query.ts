import { AUDIT_ACTOR_TYPES, AUDIT_EVENT_TYPES, AUDIT_TARGET_TYPES, type AuditActorType, type AuditEventType, type AuditTargetType } from "./audit-contract";
import { parseVehicleTrackTimestamp } from "../vehicle-track/vehicle-track-range";

export type AuditFilters = Readonly<{ eventType?: AuditEventType; actorType?: AuditActorType; targetType?: AuditTargetType; from?: string; to?: string }>;
export type AuditRequestQuery = AuditFilters & Readonly<{ cursor?: string }>;
export class AuditQueryError extends Error { public constructor() { super("Invalid audit query"); this.name = "AuditQueryError"; } }

function one(params: URLSearchParams, key: string): string | undefined {
  const values = params.getAll(key);
  if (values.length === 0) return undefined;
  if (values.length !== 1 || values[0] === "") throw new AuditQueryError();
  return values[0];
}

export function parseAuditRequestQuery(params: URLSearchParams): AuditRequestQuery {
  const allowed = new Set(["eventType", "actorType", "targetType", "from", "to", "cursor"]);
  if ([...params.keys()].some((key) => !allowed.has(key))) throw new AuditQueryError();
  const eventType = one(params, "eventType");
  const actorType = one(params, "actorType");
  const targetType = one(params, "targetType");
  const fromText = one(params, "from");
  const toText = one(params, "to");
  const cursor = one(params, "cursor");
  if (eventType !== undefined && !AUDIT_EVENT_TYPES.includes(eventType as AuditEventType)) throw new AuditQueryError();
  if (actorType !== undefined && !AUDIT_ACTOR_TYPES.includes(actorType as AuditActorType)) throw new AuditQueryError();
  if (targetType !== undefined && !AUDIT_TARGET_TYPES.includes(targetType as AuditTargetType)) throw new AuditQueryError();
  const from = fromText === undefined ? undefined : parseVehicleTrackTimestamp(fromText);
  const to = toText === undefined ? undefined : parseVehicleTrackTimestamp(toText);
  if (fromText !== undefined && from === null || toText !== undefined && to === null || from !== undefined && from !== null && to !== undefined && to !== null && from.getTime() > to.getTime()) throw new AuditQueryError();
  if (cursor !== undefined && !/^[A-Za-z0-9_-]{1,512}$/.test(cursor)) throw new AuditQueryError();
  return Object.freeze({
    ...(eventType === undefined ? {} : { eventType: eventType as AuditEventType }),
    ...(actorType === undefined ? {} : { actorType: actorType as AuditActorType }),
    ...(targetType === undefined ? {} : { targetType: targetType as AuditTargetType }),
    ...(from === undefined || from === null ? {} : { from: from.toISOString() }),
    ...(to === undefined || to === null ? {} : { to: to.toISOString() }),
    ...(cursor === undefined ? {} : { cursor }),
  });
}

export function serializeAuditRequestQuery(query: AuditRequestQuery): string {
  const params = new URLSearchParams();
  for (const key of ["eventType", "actorType", "targetType", "from", "to", "cursor"] as const) if (query[key] !== undefined) params.set(key, query[key]);
  return params.toString();
}

export function normalizeAuditFilters(filters: Readonly<Record<keyof AuditFilters, string | undefined>>): AuditFilters {
  return parseAuditRequestQuery(new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== "")));
}
