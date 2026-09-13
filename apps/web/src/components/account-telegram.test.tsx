import "../test-setup-alias";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ConfigProvider } from "antd";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountTelegram } from "./account-telegram";
import { AccountTelegramOperationError, AccountTelegramWorkspace } from "./account-telegram-workspace";
import { I18nProvider } from "../i18n/client";
import type { TelegramWorkspaceInitial } from "./account-telegram-workspace";

const LINK = {
  telegramUrl: "https://t.me/taxi_helper_bot?start=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM_123",
  expiresAt: "2030-01-01T00:00:00.000Z",
};
const EXPIRED_LINK = { ...LINK, expiresAt: "2001-01-01T00:00:00.000Z" };
const available = (
  status: "NOT_CONNECTED" | "LINK_PENDING" | "CONNECTED" | "BROKEN",
  pendingExpiresAt: string | null = null,
  notificationsEnabled: boolean | null = null,
): TelegramWorkspaceInitial => ({
  availability: "available",
  connection: { status, pendingExpiresAt },
  notificationsEnabled,
});
const render = (initial: TelegramWorkspaceInitial, locale: "uk" | "ru" | "en" = "en") => renderToStaticMarkup(
  <ConfigProvider><I18nProvider locale={locale}><AccountTelegram initial={initial} locale={locale} signOutAction={<button type="button">Sign out fixture</button>} /></I18nProvider></ConfigProvider>,
);
// Direct workspace renders exercise browser-only link states through the
// ephemeral `initialLink` seam (production always starts without one).
const renderWorkspace = (initial: TelegramWorkspaceInitial, initialLink: typeof LINK | null = null, locale: "uk" | "ru" | "en" = "en") => renderToStaticMarkup(
  <ConfigProvider><I18nProvider locale={locale}><AccountTelegramWorkspace initial={initial} locale={locale} initialLink={initialLink} /></I18nProvider></ConfigProvider>,
);

const roleCount = (html: string, role: string): number => (html.match(new RegExp(`role="${role}"`, "g")) ?? []).length;

test("Telegram reuses the shared centered Account workspace and navigation", () => {
  const html = render({ availability: "unavailable" });
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, />Telegram</);
  assert.match(html, /Connect your Fleet GPS account to a private Telegram chat\./);
  assert.match(html, /<nav[^>]+aria-label="Account sections"/);
  assert.match(html, /aria-current="page" href="\/account\/telegram"/);
  assert.match(html, /account-telegram-card/);
  assert.match(html, /account-signout/);
  assert.doesNotMatch(html, /auth-page|auth-card|account-card/);
});

test("NOT_CONNECTED stays neutral with a single Connect action", () => {
  const html = render(available("NOT_CONNECTED"));
  assert.match(html, /ant-tag[^>]*>Not connected</);
  // One useful sentence follows the Tag; nothing restates it.
  assert.match(html, /Connect a private Telegram chat to receive personal Fleet GPS notifications\./);
  assert.doesNotMatch(html, /Telegram is not connected\./);
  assert.match(html, />Connect Telegram</);
  assert.doesNotMatch(html, />Disconnect Telegram</);
  assert.doesNotMatch(html.slice(html.indexOf("account-telegram-card"), html.indexOf("account-signout")), /ant-tag-success|ant-tag-warning|ant-tag-processing|ant-tag-error/);
});

test("LINK_PENDING with a live URL opens Telegram without printing the token", () => {
  const html = renderWorkspace(available("LINK_PENDING", LINK.expiresAt), LINK);
  assert.match(html, /ant-tag-processing[^>]*>Confirmation pending</);
  // A small confirmation sub-section replaces the repeated waiting sentence.
  assert.match(html, />Connection confirmation</);
  assert.doesNotMatch(html, /Waiting for Telegram confirmation\./);
  assert.match(html, /<time dateTime="2030-01-01T00:00:00\.000Z">/);
  assert.match(html, /Your link is ready\. Open Telegram to confirm the connection\./);
  assert.match(html, />Open Telegram</);
  assert.match(html, /href="https:\/\/t\.me\//);
  assert.match(html, />Generate a new link</);
  // The token-bearing URL is an action target only, never visible text.
  assert.doesNotMatch(html, />https:\/\//);
  assert.doesNotMatch(html, /start=[A-Za-z0-9_-]{43}</);
  assert.doesNotMatch(html, />Disconnect Telegram</);
});

test("an expired local link stops offering Open Telegram", () => {
  const html = renderWorkspace(available("LINK_PENDING", EXPIRED_LINK.expiresAt), EXPIRED_LINK);
  assert.match(html, />Expired</);
  assert.match(html, /This one-time link has expired\. Generate a replacement to continue\./);
  assert.match(html, />Generate new link</);
  assert.doesNotMatch(html, /href="https:\/\/t\.me\//);
  assert.doesNotMatch(html, />Open Telegram</);
});

test("LINK_PENDING without a local URL tells the reload truth", () => {
  const html = renderWorkspace(available("LINK_PENDING", LINK.expiresAt), null);
  assert.match(html, /A link was already created, but it is not shown again for security\. Create a new link\./);
  assert.match(html, />Generate new link</);
  assert.doesNotMatch(html, /href="https:\/\/t\.me\//);
});

test("CONNECTED offers replacement and restrained disconnect", () => {
  const on = renderWorkspace(available("CONNECTED", null, true));
  assert.match(on, /ant-tag-success[^>]*>Connected</);
  // No duplicate "Connected" prose right after the Tag.
  assert.doesNotMatch(on, /Telegram is connected\./);
  assert.match(on, /Notifications:.*On/);
  assert.match(on, />Replace connection</);
  assert.match(on, />Disconnect Telegram</);
  assert.doesNotMatch(on, /Replacement connection/);
  const off = renderWorkspace(available("CONNECTED", null, false));
  assert.match(off, /Notifications:.*Off/);
});

test("CONNECTED with a replacement pending keeps the connection authoritative", () => {
  const html = renderWorkspace(available("CONNECTED", LINK.expiresAt, true), LINK);
  assert.match(html, /ant-tag-success[^>]*>Connected</);
  assert.match(html, /aria-label="Replacement connection"/);
  assert.match(html, /The current Telegram connection remains active until replacement succeeds\./);
  assert.match(html, /<time dateTime="2030-01-01T00:00:00\.000Z">/);
  assert.match(html, />Open Telegram</);
  // The whole screen never degrades into LINK_PENDING.
  assert.doesNotMatch(html, />Confirmation pending</);
  assert.doesNotMatch(html, /ant-tag-processing/);
});

test("BROKEN stays distinct, actionable, and never not-connected", () => {
  const html = renderWorkspace(available("BROKEN"));
  assert.match(html, /ant-tag-warning[^>]*>Reconnect needed</);
  assert.match(html, /Telegram delivery cannot use the saved connection\./);
  assert.doesNotMatch(html, /Telegram needs reconnecting\./);
  assert.match(html, />Reconnect Telegram</);
  assert.match(html, />Disconnect Telegram</);
  assert.doesNotMatch(html, />Not connected</);
  assert.doesNotMatch(html, />Connect Telegram</);
});

test("BROKEN with a replacement pending keeps BROKEN authoritative", () => {
  const html = renderWorkspace(available("BROKEN", LINK.expiresAt), LINK);
  assert.match(html, /ant-tag-warning[^>]*>Reconnect needed</);
  assert.match(html, /aria-label="Replacement connection"/);
  assert.match(html, />Generate a new link</);
  assert.doesNotMatch(html, />Not connected</);
});

test("unavailable reads stay unavailable without guessed actions", () => {
  const html = renderWorkspace({ availability: "unavailable" }, null);
  assert.match(html, /Status unavailable/);
  assert.match(html, /Current status could not be loaded\./);
  assert.match(html, />Retry</);
  assert.doesNotMatch(html, />Connect Telegram</);
  assert.doesNotMatch(html, />Disconnect Telegram</);
  assert.doesNotMatch(html, /ant-tag/);
});

test("operation error Alert owns one assertive live region without changing its visual type or copy", () => {
  const html = renderToStaticMarkup(<ConfigProvider><AccountTelegramOperationError title="Connection failed" /></ConfigProvider>);
  assert.equal(roleCount(html, "alert"), 1);
  assert.equal(roleCount(html, "status"), 0);
  assert.match(html, /ant-alert-error/);
  assert.match(html, />Connection failed</);
  const source = readFileSync("src/components/account-telegram-workspace.tsx", "utf8");
  assert.doesNotMatch(source, /<div role="alert"><Alert/);
});

test("telegram copy is localized in UK, RU, and EN", () => {
  const expected = {
    uk: { subtitle: "Підключіть свій обліковий запис Fleet GPS", help: "отримувати особисті сповіщення Fleet GPS", connect: ">Підключити Telegram<", expired: "Прострочено", replace: ">Замінити підключення<", confirm: "Підтвердження підключення", broken: "не може використовувати збережене підключення" },
    ru: { subtitle: "Подключите свой аккаунт Fleet GPS", help: "получать личные уведомления Fleet GPS", connect: ">Подключить Telegram<", expired: "Просрочена", replace: ">Заменить подключение<", confirm: "Подтверждение подключения", broken: "не может использовать сохранённое подключение" },
    en: { subtitle: "Connect your Fleet GPS account", help: "receive personal Fleet GPS notifications", connect: ">Connect Telegram<", expired: ">Expired<", replace: ">Replace connection<", confirm: "Connection confirmation", broken: "cannot use the saved connection" },
  } as const;
  for (const locale of ["uk", "ru", "en"] as const) {
    const copy = expected[locale];
    const shell = render(available("NOT_CONNECTED"), locale);
    assert.ok(shell.includes(copy.subtitle), `${locale}: subtitle`);
    const idle = renderWorkspace(available("NOT_CONNECTED"), null, locale);
    assert.ok(idle.includes(copy.help), `${locale}: help`);
    assert.ok(idle.includes(copy.connect), `${locale}: connect`);
    const pending = renderWorkspace(available("LINK_PENDING", LINK.expiresAt), LINK, locale);
    assert.ok(pending.includes(copy.confirm), `${locale}: confirmation`);
    const broken = renderWorkspace(available("BROKEN"), null, locale);
    assert.ok(broken.includes(copy.broken), `${locale}: broken`);
    const stale = renderWorkspace(available("LINK_PENDING", EXPIRED_LINK.expiresAt), EXPIRED_LINK, locale);
    assert.ok(stale.includes(copy.expired), `${locale}: expired`);
    const healthy = renderWorkspace(available("CONNECTED"), null, locale);
    assert.ok(healthy.includes(copy.replace), `${locale}: replace`);
  }
});

test("server boundary stays session-only with no legacy composition", () => {
  const server = readFileSync("src/lib/account/account-telegram-server.ts", "utf8");
  assert.match(server, /authenticatedApiFetch/);
  assert.doesNotMatch(server, /cookies\(|Cookie|jar\.toString/);
  const page = readFileSync("src/app/account/telegram/page.tsx", "utf8");
  assert.match(page, /loadAccountTelegramState/);
  assert.doesNotMatch(page, /redirect\(|notifications#telegram/);
});

test("interaction guards and secret hygiene hold in the live component", () => {
  const source = readFileSync("src/components/account-telegram-workspace.tsx", "utf8");
  assert.match(source, /TELEGRAM_STATUS_POLL_MS/);
  assert.match(source, /visibilityState/);
  assert.match(source, /inflight\.current/);
  assert.match(source, /generation\.current !== run/);
  assert.match(source, /if \(busy\) return/);
  assert.match(source, /<AlertDialog/);
  assert.match(source, /view\.status !== "NOT_CONNECTED"/);
  assert.match(source, /document\.visibilityState/);
  // Token-bearing URLs live in component state only.
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\.|URLSearchParams/);
});

test("telegram surface keeps the Account rhythm and mobile touch targets", () => {
  const css = readFileSync("src/styles/account.css", "utf8");
  for (const selector of ["\\.account-telegram-card", "\\.account-telegram__title", "\\.account-telegram__actions", "\\.account-telegram__replacement"]) {
    assert.match(css, new RegExp(selector));
  }
  assert.match(css, /min-height:\s*44px/);
});

test("Telegram actions use compact natural width on desktop, full-width primary on mobile", () => {
  // Overview/Security grammar: default-size Ant buttons, never stretched.
  const source = readFileSync("src/components/account-telegram-workspace.tsx", "utf8");
  assert.doesNotMatch(source, /size="large"/);
  const css = readFileSync("src/styles/account.css", "utf8");
  const ruleStart = css.indexOf(".account-telegram__actions {");
  const baseActions = css.slice(ruleStart, css.indexOf("}", ruleStart));
  assert.doesNotMatch(baseActions, /(?<!min-)width\s*:|display\s*:\s*block/);
  assert.match(css, /\.account-telegram__actions \.ant-btn \{[\s\S]{0,60}flex:\s*none/);
  const mobile = css.slice(css.indexOf("@media (max-width: 799px)"));
  assert.match(mobile, /\.account-telegram__actions[\s\S]{0,400}width:\s*100%/);
});
