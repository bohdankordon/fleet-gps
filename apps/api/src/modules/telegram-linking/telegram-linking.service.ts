import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";
import { NotificationVehicleScope, TelegramConnectionStatus } from "../../generated/prisma/enums";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import { AuditEventRepository, buildTelegramDisconnectedAuditEvent, buildTelegramLinkedAuditEvent, type AuditUserActor } from "../audit";
import { DatabaseService } from "../database/database.service";
import { applyVehicleScope, authorizedNotificationSelectionWhere } from "../vehicle-access/vehicle-access.service";
import { VehicleScopeService } from "../vehicle-access/vehicle-access.service";
import { TelegramLinkRateLimiter } from "./telegram-link-rate-limiter";
import { TELEGRAM_PRODUCT_BOT_TRANSPORT, type TelegramProductBotTransport } from "./telegram-product-bot.transport";

export type TelegramConnectionView = Readonly<{ status: "NOT_CONNECTED" | "LINK_PENDING" | "CONNECTED" | "BROKEN"; pendingExpiresAt: string | null }>;
export type NotificationPreferencesView = Readonly<{ enabled: boolean; speedingEnabled: boolean; inactivityEnabled: boolean; vehicleScope: "ALL" | "SELECTED"; selectedVehicleIds: readonly string[]; revision: number; canSelectVehicles: boolean; hasDormantSelections: boolean; vehicles: readonly Readonly<{ id: string; name: string; disabled: boolean }>[] }>;
export type TelegramLinkResult = Readonly<{ status: "LINK_PENDING"; expiresAt: string; telegramUrl: string }>;
export type TelegramInbound = Readonly<{ updateId: bigint; chatId: bigint; userId: bigint; chatType: string; text: string | null }>;
export type LinkOutcome = "LINKED" | "INVALID" | "DUPLICATE" | "IGNORED" | "DISABLED";
const TOKEN_TTL_MS = 10 * 60 * 1_000;

function tokenHash(token: string): Uint8Array<ArrayBuffer> { return new Uint8Array(createHash("sha256").update(token, "utf8").digest()) as Uint8Array<ArrayBuffer>; }
function token(): string { return randomBytes(32).toString("base64url"); }
function safeTelegramId(value: bigint): boolean { return value > 0n && value <= 9_007_199_254_740_991n; }
function duplicate(error: unknown): boolean { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"; }

export class TelegramLinkingError extends Error { public constructor(public readonly code: "DISABLED" | "INELIGIBLE" | "NOT_FOUND" | "RATE_LIMITED") { super(code); } }
export class NotificationPreferencesError extends Error { public constructor(public readonly code: "INVALID_INPUT" | "CONFLICT" | "FORBIDDEN") { super(code); } }
const DEFAULT_PREFERENCES = Object.freeze({ enabled: false, speedingEnabled: true, inactivityEnabled: true, vehicleScope: "ALL" as const, selectedVehicleIds: Object.freeze([]), revision: 0 });
function canSelectVehicles(permissions: readonly string[]): boolean { return permissions.includes("vehicles.view"); }
function preferenceInput(value: unknown, allowVehicles: boolean): Readonly<{ expectedRevision: number; enabled: boolean; speedingEnabled: boolean; inactivityEnabled: boolean; vehicleScope: "ALL" | "SELECTED"; selectedVehicleIds: readonly string[] }> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new NotificationPreferencesError("INVALID_INPUT"); const input = value as Record<string, unknown>;
  const allowed = allowVehicles ? ["expectedRevision", "enabled", "speedingEnabled", "inactivityEnabled", "vehicleScope", "selectedVehicleIds"] : ["expectedRevision", "enabled", "speedingEnabled", "inactivityEnabled"];
  if (Object.keys(input).some((key) => !allowed.includes(key)) || allowed.some((key) => !(key in input))) throw new NotificationPreferencesError("INVALID_INPUT");
  if (!Number.isSafeInteger(input.expectedRevision) || (input.expectedRevision as number) < 0 || typeof input.enabled !== "boolean" || typeof input.speedingEnabled !== "boolean" || typeof input.inactivityEnabled !== "boolean") throw new NotificationPreferencesError("INVALID_INPUT");
  if (!allowVehicles) return Object.freeze({ expectedRevision: input.expectedRevision as number, enabled: input.enabled, speedingEnabled: input.speedingEnabled, inactivityEnabled: input.inactivityEnabled, vehicleScope: "ALL", selectedVehicleIds: Object.freeze([]) });
  if ((input.vehicleScope !== "ALL" && input.vehicleScope !== "SELECTED") || !Array.isArray(input.selectedVehicleIds) || input.selectedVehicleIds.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) throw new NotificationPreferencesError("INVALID_INPUT");
  const ids = input.selectedVehicleIds as string[]; if (new Set(ids).size !== ids.length) throw new NotificationPreferencesError("INVALID_INPUT");
  return Object.freeze({ expectedRevision: input.expectedRevision as number, enabled: input.enabled, speedingEnabled: input.speedingEnabled, inactivityEnabled: input.inactivityEnabled, vehicleScope: input.vehicleScope, selectedVehicleIds: Object.freeze(ids) });
}

@Injectable()
export class TelegramLinkingService {
  public constructor(private readonly database: DatabaseService, private readonly audit: AuditEventRepository, @Inject(API_CONFIG) private readonly config: ApiConfig, private readonly limiter: TelegramLinkRateLimiter, @Inject(TELEGRAM_PRODUCT_BOT_TRANSPORT) private readonly bot: TelegramProductBotTransport, private readonly scopes: VehicleScopeService) {}

  public enabled(): boolean { return this.config.telegramProductLinking?.enabled === true; }
  public async preferences(userId: string, permissions: readonly string[]): Promise<NotificationPreferencesView> {
    const allowed = canSelectVehicles(permissions); const client = this.database.getClient();
    const scope = allowed ? await this.scopes.resolve(userId) : null;
    const [stored, vehicles] = await Promise.all([client.userNotificationPreferences.findUnique({ where: { userId }, include: { vehicles: { orderBy: { vehicleId: "asc" } } } }), allowed && scope ? client.vehicle.findMany({ where: applyVehicleScope(scope), orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, disabled: true } }) : Promise.resolve([])]);
    const base = stored ? { enabled: stored.enabled, speedingEnabled: stored.speedingEnabled, inactivityEnabled: stored.inactivityEnabled, vehicleScope: stored.vehicleScope, selectedVehicleIds: stored.vehicles.map(({ vehicleId }) => vehicleId), revision: stored.revision } : DEFAULT_PREFERENCES;
    const authorizedIds = new Set(vehicles.map((vehicle) => vehicle.id));
    const visibleSelected = allowed ? base.selectedVehicleIds.filter((vehicleId) => authorizedIds.has(vehicleId)) : [];
    const hasDormantSelections = allowed && stored ? base.selectedVehicleIds.length > visibleSelected.length : false;
    return Object.freeze({ enabled: base.enabled, speedingEnabled: base.speedingEnabled, inactivityEnabled: base.inactivityEnabled, vehicleScope: base.vehicleScope, selectedVehicleIds: Object.freeze(visibleSelected), revision: base.revision, canSelectVehicles: allowed, hasDormantSelections, vehicles: Object.freeze(vehicles) });
  }
  public async updatePreferences(userId: string, permissions: readonly string[], value: unknown): Promise<NotificationPreferencesView> {
    const allowed = canSelectVehicles(permissions); const input = preferenceInput(value, allowed); const client = this.database.getClient();
    const scope = allowed ? await this.scopes.resolve(userId) : null;
    await client.$transaction(async (tx) => {
      const current = await tx.userNotificationPreferences.findUnique({ where: { userId } });
      if (!current) {
        if (input.expectedRevision !== 0) throw new NotificationPreferencesError("CONFLICT");
        if (allowed && scope) { const count = input.selectedVehicleIds.length === 0 ? 0 : await tx.vehicle.count({ where: applyVehicleScope(scope, { id: { in: [...input.selectedVehicleIds] } }) }); if (count !== input.selectedVehicleIds.length) throw new NotificationPreferencesError("INVALID_INPUT"); }
        if (allowed && input.vehicleScope === "SELECTED" && input.selectedVehicleIds.length === 0) throw new NotificationPreferencesError("INVALID_INPUT");
        try { await tx.userNotificationPreferences.create({ data: { userId, enabled: input.enabled, speedingEnabled: input.speedingEnabled, inactivityEnabled: input.inactivityEnabled, vehicleScope: allowed ? input.vehicleScope as NotificationVehicleScope : NotificationVehicleScope.ALL, ...(allowed ? { vehicles: { createMany: { data: input.selectedVehicleIds.map((vehicleId) => ({ vehicleId })) } } } : {}) } }); }
        catch (error) { if (duplicate(error)) throw new NotificationPreferencesError("CONFLICT"); throw error; }
        return;
      }
      if (current.revision !== input.expectedRevision) throw new NotificationPreferencesError("CONFLICT");
      if (allowed && scope) {
        const submitted = [...input.selectedVehicleIds];
        const authorizedCount = submitted.length === 0 ? 0 : await tx.vehicle.count({ where: applyVehicleScope(scope, { id: { in: submitted } }) });
        if (authorizedCount !== submitted.length) throw new NotificationPreferencesError("INVALID_INPUT");
        const existing = await tx.userNotificationVehicle.findMany({ where: { userId }, select: { vehicleId: true } });
        const authorizedExisting = await tx.userNotificationVehicle.findMany({ where: authorizedNotificationSelectionWhere(userId, scope), select: { vehicleId: true } });
        const authorizedSet = new Set(authorizedExisting.map((row) => row.vehicleId));
        const dormant = existing.map((row) => row.vehicleId).filter((vehicleId) => !authorizedSet.has(vehicleId));
        const merged = [...new Set([...submitted, ...dormant])];
        if (input.vehicleScope === "SELECTED" && merged.length === 0) throw new NotificationPreferencesError("INVALID_INPUT");
        await tx.userNotificationVehicle.deleteMany({ where: { userId } });
        if (merged.length) await tx.userNotificationVehicle.createMany({ data: merged.map((vehicleId) => ({ userId, vehicleId })) });
      }
      const updated = await tx.userNotificationPreferences.updateMany({ where: { userId, revision: input.expectedRevision }, data: { enabled: input.enabled, speedingEnabled: input.speedingEnabled, inactivityEnabled: input.inactivityEnabled, ...(allowed ? { vehicleScope: input.vehicleScope as NotificationVehicleScope } : {}), revision: { increment: 1 } } }); if (updated.count !== 1) throw new NotificationPreferencesError("CONFLICT");
    });
    return this.preferences(userId, permissions);
  }
  public async status(userId: string): Promise<TelegramConnectionView> {
    const now = new Date(); const client = this.database.getClient();
    const [connection, pending] = await Promise.all([client.telegramConnection.findUnique({ where: { userId } }), client.telegramLinkToken.findFirst({ where: { userId, consumedAt: null, revokedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" } })]);
    if (connection?.status === TelegramConnectionStatus.CONNECTED) return Object.freeze({ status: "CONNECTED", pendingExpiresAt: pending?.expiresAt.toISOString() ?? null });
    if (connection?.status === TelegramConnectionStatus.BROKEN) return Object.freeze({ status: "BROKEN", pendingExpiresAt: pending?.expiresAt.toISOString() ?? null });
    return Object.freeze({ status: pending ? "LINK_PENDING" : "NOT_CONNECTED", pendingExpiresAt: pending?.expiresAt.toISOString() ?? null });
  }

  public async createLink(userId: string): Promise<TelegramLinkResult> {
    if (!this.enabled() || !this.config.telegramProductLinking?.botUsername) throw new TelegramLinkingError("DISABLED");
    if (!this.limiter.check(userId)) throw new TelegramLinkingError("RATE_LIMITED");
    const raw = token(); const hash = tokenHash(raw); const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await this.database.getClient().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      const user = await tx.authUser.findUnique({ where: { id: userId }, select: { disabled: true, mustChangePassword: true } });
      if (!user || user.disabled || user.mustChangePassword) throw new TelegramLinkingError("INELIGIBLE");
      const now = new Date();
      await tx.telegramLinkToken.updateMany({ where: { userId, consumedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { revokedAt: now } });
      await tx.telegramLinkToken.create({ data: { userId, tokenHash: hash, expiresAt } });
    });
    return Object.freeze({ status: "LINK_PENDING", expiresAt: expiresAt.toISOString(), telegramUrl: `https://t.me/${this.config.telegramProductLinking.botUsername}?start=${raw}` });
  }

  public async disconnect(actor: AuditUserActor, userId: string, targetId = userId): Promise<TelegramConnectionView> {
    await this.database.getClient().$transaction(async (tx) => {
      const now = new Date();
      const current = await tx.telegramConnection.findUnique({ where: { userId: targetId } });
      await tx.telegramLinkToken.updateMany({ where: { userId: targetId, consumedAt: null, revokedAt: null }, data: { revokedAt: now } });
      if (current && current.status !== TelegramConnectionStatus.DISCONNECTED) {
        await tx.telegramConnection.update({ where: { userId: targetId }, data: { status: TelegramConnectionStatus.DISCONNECTED, telegramUserId: null, telegramChatId: null, brokenAt: null, connectionRevision: { increment: 1 } } });
        await this.audit.append(tx, buildTelegramDisconnectedAuditEvent(actor, targetId));
      }
    });
    return this.status(targetId);
  }

  public verifySecret(value: string | null): boolean {
    const expected = this.config.telegramProductLinking?.webhookSecret;
    if (!this.enabled() || !expected || !value) return false;
    const a = Buffer.from(expected); const b = Buffer.from(value);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  public async consume(inbound: TelegramInbound): Promise<LinkOutcome> {
    if (!this.enabled() || !safeTelegramId(inbound.updateId) || !safeTelegramId(inbound.chatId) || !safeTelegramId(inbound.userId) || inbound.chatType !== "private") return "IGNORED";
    const match = /^\/start(?:\s+([A-Za-z0-9_-]{43}))?\s*$/.exec(inbound.text ?? "");
    if (!match?.[1]) { if (inbound.chatType === "private" && (inbound.text === "/help" || inbound.text === "/start")) void this.bot.sendHelp(inbound.chatId).catch(() => undefined); return "IGNORED"; }
    const outcome = await this.database.getClient().$transaction(async (tx) => {
      try { await tx.telegramWebhookReceipt.create({ data: { updateId: inbound.updateId } }); } catch (error) { if (duplicate(error)) return "DUPLICATE" as const; throw error; }
      const now = new Date(); const hashed = tokenHash(match[1]!);
      const link = await tx.telegramLinkToken.findUnique({ where: { tokenHash: hashed } });
      if (!link || link.consumedAt || link.revokedAt || link.expiresAt <= now) return "INVALID" as const;
      const user = await tx.authUser.findUnique({ where: { id: link.userId }, select: { disabled: true, mustChangePassword: true, login: true } });
      if (!user || user.disabled || user.mustChangePassword) return "DISABLED" as const;
      const existing = await tx.telegramConnection.findFirst({ where: { OR: [{ telegramUserId: inbound.userId }, { telegramChatId: inbound.chatId }], NOT: { userId: link.userId } } });
      if (existing?.status === TelegramConnectionStatus.CONNECTED) return "INVALID" as const;
      await tx.telegramConnection.upsert({ where: { userId: link.userId }, create: { userId: link.userId, telegramUserId: inbound.userId, telegramChatId: inbound.chatId, status: TelegramConnectionStatus.CONNECTED, linkedAt: now }, update: { telegramUserId: inbound.userId, telegramChatId: inbound.chatId, status: TelegramConnectionStatus.CONNECTED, linkedAt: now, brokenAt: null, connectionRevision: { increment: 1 } } });
      await tx.telegramLinkToken.update({ where: { id: link.id }, data: { consumedAt: now } });
      await this.audit.append(tx, buildTelegramLinkedAuditEvent({ actorType: "USER", actorUserId: link.userId, actorLoginSnapshot: user.login }, link.userId));
      return "LINKED" as const;
    });
    if (outcome === "LINKED") void this.bot.sendLinkSuccess(inbound.chatId).catch(() => undefined);
    else if (outcome === "INVALID" || outcome === "DISABLED") void this.bot.sendLinkFailure(inbound.chatId).catch(() => undefined);
    return outcome;
  }
}

export const TELEGRAM_LINK_TOKEN_TTL_MS = TOKEN_TTL_MS;
export const hashTelegramLinkToken = tokenHash;
export const generateTelegramLinkToken = token;
