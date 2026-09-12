// Pure Telegram connection model: server-view parsing, one-time link
// validation, expiry, and error mapping without React, so the security and
// truthfulness boundaries are unit-testable. Identifiers, token hashes, and
// raw tokens never survive these projections.
import type { MessageKey } from "../../i18n/messages";
import { ACCOUNT_TELEGRAM_STATUSES, type AccountTelegramStatus } from "./account-notification-summary";

export const TELEGRAM_STATUS_POLL_MS = 5000;

// Must stay in sync with the backend link format
// (`https://t.me/<bot>?start=<43 base64url chars>`) without trusting it.
const LINK_URL_PATTERN = /^https:\/\/t\.me\/[^/?#]+\?start=[A-Za-z0-9_-]{43}$/;

export type TelegramConnectionView = Readonly<{
  status: AccountTelegramStatus;
  pendingExpiresAt: string | null;
}>;

export type TelegramLinkTicket = Readonly<{
  telegramUrl: string;
  expiresAt: string;
}>;

function validInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

// Only status + pending expiry survive; chat/user IDs, token hashes, and
// every other server field are dropped at this boundary.
export function parseTelegramConnectionView(value: unknown): TelegramConnectionView | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (!ACCOUNT_TELEGRAM_STATUSES.includes(candidate.status as AccountTelegramStatus)) return null;
  const pending = candidate.pendingExpiresAt;
  if (pending !== null && pending !== undefined && !validInstant(pending)) return null;
  return Object.freeze({
    status: candidate.status as AccountTelegramStatus,
    pendingExpiresAt: typeof pending === "string" ? pending : null,
  });
}

// A created link is accepted only with a well-formed Telegram URL and a
// parseable expiry. The raw URL is returned for ephemeral in-memory use
// only; callers must never persist, log, or print it.
export function parseTelegramLinkTicket(value: unknown): TelegramLinkTicket | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.telegramUrl !== "string" || !LINK_URL_PATTERN.test(candidate.telegramUrl)) return null;
  if (!validInstant(candidate.expiresAt)) return null;
  return Object.freeze({ telegramUrl: candidate.telegramUrl, expiresAt: candidate.expiresAt as string });
}

export function isLinkExpired(expiresAt: string, nowMs: number): boolean {
  return Date.parse(expiresAt) <= nowMs;
}

// Truthful mapping of what link creation exposes: rate limits and disabled
// linking stay actionable, ineligible accounts keep their confirmed truth,
// everything else (including network failure) is generic and body-free.
export function linkErrorKey(status: number | null): MessageKey {
  if (status === 429) return "telegram.error.rate";
  if (status === 409) return "telegram.error.disabled";
  if (status === 403) return "account.telegram.error.ineligible";
  return "telegram.error.generic";
}
