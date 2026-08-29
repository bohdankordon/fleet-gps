import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import { TelegramConnectionStatus } from "../../generated/prisma/enums";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import { AuditEventRepository, buildTelegramDisconnectedAuditEvent, buildTelegramLinkedAuditEvent, type AuditUserActor } from "../audit";
import { DatabaseService } from "../database/database.service";
import { TelegramLinkRateLimiter } from "./telegram-link-rate-limiter";
import { TELEGRAM_PRODUCT_BOT_TRANSPORT, type TelegramProductBotTransport } from "./telegram-product-bot.transport";

export type TelegramConnectionView = Readonly<{ status: "NOT_CONNECTED" | "LINK_PENDING" | "CONNECTED" | "BROKEN"; pendingExpiresAt: string | null }>;
export type TelegramLinkResult = Readonly<{ status: "LINK_PENDING"; expiresAt: string; telegramUrl: string }>;
export type TelegramInbound = Readonly<{ updateId: bigint; chatId: bigint; userId: bigint; chatType: string; text: string | null }>;
export type LinkOutcome = "LINKED" | "INVALID" | "DUPLICATE" | "IGNORED" | "DISABLED";
const TOKEN_TTL_MS = 10 * 60 * 1_000;

function tokenHash(token: string): Uint8Array<ArrayBuffer> { return new Uint8Array(createHash("sha256").update(token, "utf8").digest()) as Uint8Array<ArrayBuffer>; }
function token(): string { return randomBytes(32).toString("base64url"); }
function safeTelegramId(value: bigint): boolean { return value > 0n && value <= 9_007_199_254_740_991n; }
function duplicate(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === "P2002"; }

export class TelegramLinkingError extends Error { public constructor(public readonly code: "DISABLED" | "INELIGIBLE" | "NOT_FOUND" | "RATE_LIMITED") { super(code); } }

@Injectable()
export class TelegramLinkingService {
  public constructor(private readonly database: DatabaseService, private readonly audit: AuditEventRepository, @Inject(API_CONFIG) private readonly config: ApiConfig, private readonly limiter: TelegramLinkRateLimiter, @Inject(TELEGRAM_PRODUCT_BOT_TRANSPORT) private readonly bot: TelegramProductBotTransport) {}

  public enabled(): boolean { return this.config.telegramProductLinking?.enabled === true; }
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
    try {
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
    } catch { return "INVALID"; }
  }
}

export const TELEGRAM_LINK_TOKEN_TTL_MS = TOKEN_TTL_MS;
export const hashTelegramLinkToken = tokenHash;
export const generateTelegramLinkToken = token;
