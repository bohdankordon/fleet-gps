import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/telegram-notifications-panel.tsx", "utf8");

test("Telegram account panel covers every public connection state without exposing identity data", () => {
  for (const state of ["NOT_CONNECTED", "LINK_PENDING", "CONNECTED", "BROKEN"]) assert.match(source, new RegExp(state));
  for (const key of ["telegram.connect", "telegram.reconnect", "telegram.regenerate", "telegram.disconnect", "telegram.pendingReload", "telegram.brokenHelp", "telegram.expires"]) assert.ok(source.includes(key), key);
  for (const secret of ["telegramUserId", "telegramChatId", "tokenHash", "botToken", "webhookSecret", "localStorage", "sessionStorage", "indexedDB", "document.cookie"]) assert.equal(source.includes(secret), false, secret);
});

test("Telegram link is transient, validated, safely opened, and survives a failed reconnect", () => {
  assert.match(source, /useState<string \| null>\(null\)/);
  assert.match(source, /\^https:\\\/\\\/t\\\.me/);
  assert.match(source, /target="_blank" rel="noopener noreferrer"/);
  assert.match(source, /r\.status === 429/);
  assert.match(source, /r\.status === 409/);
  assert.match(source, /setState\(\{ status: "LINK_PENDING"/);
  assert.match(source, /AlertDialog open=\{confirmDisconnect\}/);
});
