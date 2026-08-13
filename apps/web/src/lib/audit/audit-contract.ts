import { z } from "zod";
import { AUTH_PERMISSIONS } from "../auth/auth-contract";

export const AUDIT_EVENT_TYPES = ["USER_CREATED", "USER_ACCESS_CHANGED", "USER_DISABLED", "USER_ENABLED", "USER_PASSWORD_RESET", "OWN_PASSWORD_CHANGED", "SHORT_POPULATION_EXECUTED", "DURABLE_POPULATION_CREATED", "RETENTION_EXECUTED", "SYSTEM_POPULATION_CREATED", "AUTOMATIC_RETENTION_EXECUTED"] as const;
export const AUDIT_ACTOR_TYPES = ["USER", "SYSTEM"] as const;
export const AUDIT_TARGET_TYPES = ["USER", "POSITION_HISTORY", "POSITION_HISTORY_POPULATION_RUN", "POSITION_HISTORY_RETENTION"] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const timestamp = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative().safe();
const positiveCount = z.number().int().positive().safe();
const permission = z.enum(AUTH_PERMISSIONS);
const role = z.enum(["ADMIN", "USER"]);
const unavailable = z.object({ status: z.literal("UNAVAILABLE") }).strict();
const available = <T extends z.ZodRawShape>(shape: T) => z.object({ status: z.literal("AVAILABLE"), ...shape }).strict();
const actor = z.discriminatedUnion("type", [z.object({ type: z.literal("USER"), login: z.string().regex(/^[A-Za-z0-9._-]{3,64}$/) }).strict(), z.object({ type: z.literal("SYSTEM") }).strict()]);
const target = <T extends AuditTargetType>(type: T, hasId: boolean) => z.object({ type: z.literal(type), id: hasId ? uuid : z.null() }).strict();
const common = { id: uuid, createdAt: timestamp, actor };
const details = <T extends z.ZodRawShape>(shape: T) => z.union([available(shape), unavailable]);
const snapshot = { targetLoginSnapshot: z.string().regex(/^[A-Za-z0-9._-]{3,64}$/) };
const population = { to: timestamp, windowBudget: positiveCount, excludeProviderDisabled: z.boolean() };
const retention = { canonicalAnchor: timestamp, policyCutoff: timestamp, deletedCheckpoints: count, deletedObservations: count, remainingFullyObsoleteCheckpoints: count, remainingExecutableObservationCandidates: count, stoppedByBudget: z.boolean() };

const auditItem = z.discriminatedUnion("eventType", [
  z.object({ ...common, eventType: z.literal("USER_CREATED"), target: target("USER", true), details: details({ ...snapshot, role, permissions: z.array(permission) }) }).strict(),
  z.object({ ...common, eventType: z.literal("USER_ACCESS_CHANGED"), target: target("USER", true), details: details({ ...snapshot, previousRole: role, role, previousPermissions: z.array(permission), permissions: z.array(permission) }) }).strict(),
  z.object({ ...common, eventType: z.literal("USER_DISABLED"), target: target("USER", true), details: details(snapshot) }).strict(),
  z.object({ ...common, eventType: z.literal("USER_ENABLED"), target: target("USER", true), details: details(snapshot) }).strict(),
  z.object({ ...common, eventType: z.literal("USER_PASSWORD_RESET"), target: target("USER", true), details: details(snapshot) }).strict(),
  z.object({ ...common, eventType: z.literal("OWN_PASSWORD_CHANGED"), target: target("USER", true), details: details({}) }).strict(),
  z.object({ ...common, eventType: z.literal("SHORT_POPULATION_EXECUTED"), target: target("POSITION_HISTORY", false), details: details({ ...population, windowBudget: z.union([z.literal(6), z.literal(12), z.literal(24)]), committedWindows: count }) }).strict(),
  z.object({ ...common, eventType: z.literal("DURABLE_POPULATION_CREATED"), target: target("POSITION_HISTORY_POPULATION_RUN", true), details: details(population) }).strict(),
  z.object({ ...common, eventType: z.literal("RETENTION_EXECUTED"), target: target("POSITION_HISTORY_RETENTION", false), details: details(retention) }).strict(),
  z.object({ ...common, eventType: z.literal("SYSTEM_POPULATION_CREATED"), target: target("POSITION_HISTORY_POPULATION_RUN", true), details: details(population) }).strict(),
  z.object({ ...common, eventType: z.literal("AUTOMATIC_RETENTION_EXECUTED"), target: target("POSITION_HISTORY_RETENTION", false), details: details(retention) }).strict(),
]);

const responseSchema = z.object({ items: z.array(auditItem).max(50), nextCursor: z.string().regex(/^[A-Za-z0-9_-]{1,512}$/).nullable(), hasMore: z.boolean() }).strict().refine((value) => value.hasMore === (value.nextCursor !== null));

export type AuditReadItem = z.infer<typeof auditItem>;
export type AuditReadResponse = z.infer<typeof responseSchema>;

export class AuditContractError extends Error { public constructor() { super("Invalid audit response"); this.name = "AuditContractError"; } }
export function parseAuditReadResponse(value: unknown): AuditReadResponse { const parsed = responseSchema.safeParse(value); if (!parsed.success) throw new AuditContractError(); return parsed.data; }
