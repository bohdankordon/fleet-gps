import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/admin-user-detail.tsx", "utf8");

test("admin user detail renders only a safe Telegram status and confirms force disconnect", () => {
  for (const expected of ["telegramStatus", "CONNECTED", "BROKEN", "/telegram/disconnect", "confirmDisconnectTelegram", "disconnectTelegramPrompt", "AlertDialog"]) assert.ok(source.includes(expected), expected);
  for (const forbidden of ["telegramUserId", "telegramChatId", "tokenHash", "webhookSecret", "botToken"]) assert.equal(source.includes(forbidden), false, forbidden);
});
