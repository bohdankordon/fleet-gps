import assert from "node:assert/strict";
import test from "node:test";
import {
  isLinkExpired,
  linkErrorKey,
  parseTelegramConnectionView,
  parseTelegramLinkTicket,
} from "./account-telegram-connection";

const view = (status = "CONNECTED", pendingExpiresAt: string | null = null) => ({
  status,
  pendingExpiresAt,
  telegramChatId: "must-not-survive",
  telegramUserId: "must-not-survive",
  tokenHash: "must-not-survive",
  preferences: { enabled: true },
});

test("connection view keeps status truth and drops identifiers and secrets", () => {
  for (const status of ["NOT_CONNECTED", "LINK_PENDING", "CONNECTED", "BROKEN"]) {
    const parsed = parseTelegramConnectionView(view(status, "2030-01-01T00:00:00.000Z"));
    assert.deepEqual(parsed, { status, pendingExpiresAt: "2030-01-01T00:00:00.000Z" });
    const serialized = JSON.stringify(parsed);
    for (const sensitive of ["telegramChatId", "telegramUserId", "tokenHash", "preferences", "chatId", "secret"]) {
      assert.doesNotMatch(serialized, new RegExp(sensitive, "i"));
    }
  }
  assert.deepEqual(parseTelegramConnectionView(view("CONNECTED")), { status: "CONNECTED", pendingExpiresAt: null });
  // Malformed or mistyped reads never become a state.
  for (const bad of [null, undefined, 42, "CONNECTED", { status: "DISCONNECTED" }, { status: "CONNECTED", pendingExpiresAt: "not-a-date" }, { status: "CONNECTED", pendingExpiresAt: 12 }]) {
    assert.equal(parseTelegramConnectionView(bad), null);
  }
});

test("link tickets require a well-formed Telegram URL and parseable expiry", () => {
  const good = { telegramUrl: "https://t.me/taxi_helper_bot?start=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM_123", expiresAt: "2030-01-01T00:00:00.000Z" };
  assert.deepEqual(parseTelegramLinkTicket(good), good);
  assert.equal(parseTelegramLinkTicket({ ...good, telegramUrl: "https://t.me/bot?start=short" }), null);
  assert.equal(parseTelegramLinkTicket({ ...good, telegramUrl: "http://t.me/bot?start=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM_123" }), null);
  assert.equal(parseTelegramLinkTicket({ ...good, telegramUrl: "https://evil.test/bot?start=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM_123" }), null);
  assert.equal(parseTelegramLinkTicket({ ...good, expiresAt: "soon" }), null);
  assert.equal(parseTelegramLinkTicket({ telegramUrl: good.telegramUrl }), null);
  assert.equal(parseTelegramLinkTicket(null), null);
});

test("link expiry is evaluated against the supplied clock", () => {
  const now = Date.parse("2030-06-01T12:00:00.000Z");
  assert.equal(isLinkExpired("2030-06-01T11:59:59.000Z", now), true);
  assert.equal(isLinkExpired("2030-06-01T12:00:00.000Z", now), true);
  assert.equal(isLinkExpired("2030-06-01T12:00:01.000Z", now), false);
});

test("link errors stay actionable without backend bodies", () => {
  assert.equal(linkErrorKey(429), "telegram.error.rate");
  assert.equal(linkErrorKey(409), "telegram.error.disabled");
  assert.equal(linkErrorKey(403), "account.telegram.error.ineligible");
  for (const status of [400, 404, 500, null]) assert.equal(linkErrorKey(status), "telegram.error.generic");
});
