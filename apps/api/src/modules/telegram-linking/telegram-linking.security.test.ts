import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { generateTelegramLinkToken, hashTelegramLinkToken, TELEGRAM_LINK_TOKEN_TTL_MS } from "./telegram-linking.service";
import { TelegramLinkRateLimiter, TELEGRAM_LINK_RATE_LIMIT } from "./telegram-link-rate-limiter";

test("link tokens are 256-bit base64url values with SHA-256-only persistence material and exact ten-minute TTL", () => {
  const raw = generateTelegramLinkToken(); const persisted = hashTelegramLinkToken(raw);
  assert.match(raw, /^[A-Za-z0-9_-]{43}$/); assert.equal(raw.length, 43); assert.equal(persisted.byteLength, 32);
  assert.deepEqual(Buffer.from(persisted), createHash("sha256").update(raw).digest()); assert.equal(TELEGRAM_LINK_TOKEN_TTL_MS, 600_000);
});
test("link generation rate limit is per user, bounded, and expires without affecting another user", () => {
  const limiter = new TelegramLinkRateLimiter(); const now = 100;
  for (let index = 0; index < TELEGRAM_LINK_RATE_LIMIT.limit; index += 1) assert.equal(limiter.check("a", now), true);
  assert.equal(limiter.check("a", now), false); assert.equal(limiter.check("b", now), true); assert.equal(limiter.check("a", now + TELEGRAM_LINK_RATE_LIMIT.windowMs), true);
});
