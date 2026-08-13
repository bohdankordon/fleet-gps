import { AuditActorType, AuditEventType, AuditTargetType } from "../../generated/prisma/enums";
import { normalizeUuid } from "../../common/uuid.validation";
import { parseAbsoluteTimestamp } from "../vehicle-track/vehicle-track-query-params";

const ALLOWED_QUERY_KEYS = Object.freeze(["eventType", "actorType", "targetType", "from", "to", "cursor"] as const);
const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;

export type AuditReadCursor = Readonly<{ createdAt: Date; id: string }>;
export type AuditReadQuery = Readonly<{
  eventType: AuditEventType | undefined;
  actorType: AuditActorType | undefined;
  targetType: AuditTargetType | undefined;
  from: Date | undefined;
  to: Date | undefined;
  cursor: AuditReadCursor | undefined;
}>;

export class AuditReadQueryError extends Error {
  public constructor() {
    super("Invalid audit read query");
    this.name = "AuditReadQueryError";
  }
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new AuditReadQueryError();
  return value;
}

function enumValue<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  const text = optionalString(value);
  if (text === undefined) return undefined;
  if (!values.includes(text as T)) throw new AuditReadQueryError();
  return text as T;
}

function timestamp(value: unknown): Date | undefined {
  const text = optionalString(value);
  if (text === undefined) return undefined;
  const parsed = parseAbsoluteTimestamp(text);
  if (parsed === null) throw new AuditReadQueryError();
  return parsed;
}

export function encodeAuditReadCursor(cursor: AuditReadCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }), "utf8").toString("base64url");
}

function parseCursor(value: unknown): AuditReadCursor | undefined {
  const text = optionalString(value);
  if (text === undefined) return undefined;
  if (text.length > 512 || !CURSOR_PATTERN.test(text)) throw new AuditReadQueryError();
  try {
    const decoded: unknown = JSON.parse(Buffer.from(text, "base64url").toString("utf8"));
    if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) throw new AuditReadQueryError();
    const fields = decoded as Record<string, unknown>;
    if (Object.keys(fields).length !== 2 || !("createdAt" in fields) || !("id" in fields)) throw new AuditReadQueryError();
    const createdAt = parseAbsoluteTimestamp(fields.createdAt);
    const id = normalizeUuid(fields.id);
    if (createdAt === null || id === null) throw new AuditReadQueryError();
    return Object.freeze({ createdAt, id });
  } catch (error) {
    if (error instanceof AuditReadQueryError) throw error;
    throw new AuditReadQueryError();
  }
}

export function parseAuditReadQuery(value: unknown): AuditReadQuery {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new AuditReadQueryError();
  const query = value as Record<string, unknown>;
  if (Object.keys(query).some((key) => !ALLOWED_QUERY_KEYS.includes(key as (typeof ALLOWED_QUERY_KEYS)[number]))) throw new AuditReadQueryError();
  const from = timestamp(query.from);
  const to = timestamp(query.to);
  if (from !== undefined && to !== undefined && from.getTime() > to.getTime()) throw new AuditReadQueryError();
  return Object.freeze({
    eventType: enumValue(query.eventType, Object.values(AuditEventType)),
    actorType: enumValue(query.actorType, Object.values(AuditActorType)),
    targetType: enumValue(query.targetType, Object.values(AuditTargetType)),
    from,
    to,
    cursor: parseCursor(query.cursor),
  });
}
