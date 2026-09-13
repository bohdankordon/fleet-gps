import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MESSAGES } from "../i18n/messages";
import type { AppLocale } from "../i18n/locales";

const source = readFileSync("src/components/admin-user-detail.tsx", "utf8");

test("admin user detail renders only a safe Telegram status and confirms force disconnect", () => {
  for (const expected of ["telegramStatus", "CONNECTED", "BROKEN", "/telegram/disconnect", "confirmDisconnectTelegram", "disconnectTelegramPrompt", "AlertDialog"]) assert.ok(source.includes(expected), expected);
  for (const forbidden of ["telegramUserId", "telegramChatId", "tokenHash", "webhookSecret", "botToken"]) assert.equal(source.includes(forbidden), false, forbidden);
});

test("disconnect confirmation keeps Fleet GPS branding with destructive semantics", () => {
  const expected = {
    uk: "Це відключить цей обліковий запис Fleet GPS від Telegram. Обліковий запис, сеанси й дозволи не зміняться.",
    ru: "Это отключит этот аккаунт Fleet GPS от Telegram. Учётная запись, сеансы и разрешения не изменятся.",
    en: "This disconnects this Fleet GPS account from Telegram. The account, sessions, and permissions do not change.",
  } as const;
  for (const locale of ["uk", "ru", "en"] as const satisfies readonly AppLocale[]) {
    const text = MESSAGES[locale]["admin.user.disconnectTelegramPrompt"];
    assert.equal(text, expected[locale]);
    assert.equal(text.includes("Taxi GPS"), false);
  }
});
