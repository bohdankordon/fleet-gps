import "../test-setup-alias";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ConfigProvider } from "antd";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountNoAccess } from "./account-no-access";
import { AccountNavigation } from "./account-navigation";
import { I18nProvider } from "../i18n/client";
import { MESSAGES } from "../i18n/messages";
import type { AppLocale } from "../i18n/locales";

const render = (locale: "uk" | "ru" | "en" = "en") => renderToStaticMarkup(
  <ConfigProvider><I18nProvider locale={locale}>
    <AccountNoAccess locale={locale} signOutAction={<button type="button">Sign out fixture</button>} />
  </I18nProvider></ConfigProvider>,
);

test("no-access stays neutral with account recovery front and center", () => {
  const html = render();
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, />Fleet GPS sections have not been assigned yet</);
  assert.match(html, /Your account is active\. Personal settings remain available, but Fleet GPS work sections have not been assigned yet\./);
  assert.match(html, />Access</);
  assert.match(html, /ant-tag[^>]*>Sections not assigned</);
  assert.match(html, /Work-section access has not been set up for this account yet\./);
  // The explicit unavailable-section list is gone: facts, not inventory.
  assert.doesNotMatch(html, /Currently unavailable:/);
  assert.doesNotMatch(html, /Автопарк · Карта/);
  assert.match(html, />Personal settings</);
  assert.match(html, /You can change your password, manage Telegram, and adjust personal notifications\./);
  assert.match(html, />Product access</);
  assert.match(html, /Contact your administrator to grant access to the Fleet GPS sections you need\./);
  assert.match(html, /href="\/account"/);
  assert.match(html, />Open Account</);
  assert.match(html, /account-signout/);
  assert.match(html, /account-security__inner/);
  // Neutral state language only: no error-page or permission vocabulary.
  assert.doesNotMatch(html, /Forbidden|403|denied/i);
  assert.doesNotMatch(html, /No permissions|Access denied/);
  assert.doesNotMatch(html, /fleet\.view|map\.view|events\.view|vehicles\.view|historyAdmin/);
  assert.doesNotMatch(html, /auth-page|auth-card|account-card|class="empty"/);
});

test("no-access navigation selects nothing and invents no destination", () => {
  const html = render();
  assert.match(html, /<nav[^>]+aria-label="Account sections"/);
  assert.doesNotMatch(html, /aria-current="page"/);
  assert.doesNotMatch(html, /ant-menu-item-selected/);
  for (const href of ["/account", "/account/change-password", "/account/telegram", "/account/notifications"]) {
    assert.ok(html.includes(`href="${href}"`), href);
  }
  assert.doesNotMatch(html, /no-access.*aria-current|aria-current.*no-access/);
  // The shared model already resolves this route to no active destination.
  const nav = readFileSync("src/components/account-navigation.tsx", "utf8");
  assert.doesNotMatch(nav, /\?\? "\/account"/);
  assert.match(nav, /selectedKeys=\{activeHref \? \[activeHref\] : \[\]\}/);
});

test("other Account screens keep their exact active states", () => {
  for (const [path, href] of [
    ["/account", "/account"],
    ["/account/change-password", "/account/change-password"],
    ["/account/telegram", "/account/telegram"],
    ["/account/notifications", "/account/notifications"],
  ] as const) {
    const html = renderToStaticMarkup(
      <ConfigProvider><I18nProvider locale="en"><AccountNavigation activePath={path} locale="en" /></I18nProvider></ConfigProvider>,
    );
    assert.match(html, new RegExp(`aria-current="page" href="${href.replace(/\//g, "\\/")}"`));
    assert.equal((html.match(/ant-menu-item-selected/g) ?? []).length, 1);
  }
});

test("no-access copy is localized in UK, RU, and EN", () => {
  const expected = {
    uk: ["Розділи Fleet GPS ще не призначено", "Ваш обліковий запис активний", "Особисті налаштування доступні", "Доступ", "Розділи не призначено", "Доступ до робочих розділів ще не налаштовано", "Особисті налаштування", "Ви можете змінити пароль", "Доступ до продукту", "Зверніться до адміністратора", "Відкрити обліковий запис"],
    ru: ["Разделы Fleet GPS ещё не назначены", "Ваша учётная запись активна", "Личные настройки доступны", "Доступ", "Разделы не назначены", "Доступ к рабочим разделам ещё не настроен", "Личные настройки", "Вы можете изменить пароль", "Доступ к продукту", "Обратитесь к администратору", "Открыть аккаунт"],
    en: ["Fleet GPS sections have not been assigned yet", "Your account is active", "Personal settings remain available", "Access", "Sections not assigned", "Work-section access has not been set up", "Personal settings", "You can change your password", "Product access", "Contact your administrator", "Open Account"],
  } as const;
  for (const locale of ["uk", "ru", "en"] as const) {
    const html = render(locale);
    for (const text of expected[locale]) assert.ok(html.includes(text), `${locale}: ${text}`);
  }
});

test("no-access route keeps the authenticated boundary without touching routing rules", () => {
  const page = readFileSync("src/app/account/no-access/page.tsx", "utf8");
  assert.match(page, /<AccountNoAccess/);
  assert.match(page, /requireAuthUser/);
  assert.doesNotMatch(page, /cookies\(|jar\.toString|class="empty"/);
  assert.doesNotMatch(page, /landingFor/);
  const surface = readFileSync("src/components/account-no-access.tsx", "utf8");
  assert.match(surface, /<AccountSignOutSection/);
  assert.match(surface, /activePath="\/account\/no-access"/);
  assert.doesNotMatch(surface, /landingFor|permission/i);
});

test("no-access surface keeps the Account rhythm with a thumb-reachable action", () => {
  const css = readFileSync("src/styles/account.css", "utf8");
  for (const selector of ["\\.account-noaccess-card", "\\.account-noaccess__title", "\\.account-noaccess__actions"]) {
    assert.match(css, new RegExp(selector));
  }
  const mobile = css.slice(css.indexOf("@media (max-width: 799px)"));
  assert.match(mobile, /\.account-noaccess__actions \.ant-btn-primary[\s\S]{0,120}width:\s*100%/);
  assert.match(mobile, /\.account-noaccess__actions \.ant-btn-primary[\s\S]{0,120}min-height:\s*44px/);
});

test("visible Account copy uses Fleet GPS, never Taxi GPS", () => {
  // Guard covers every Account- and Telegram-screen message in all locales.
  // Technical identifiers, other surfaces, and test names are out of scope.
  for (const locale of ["uk", "ru", "en"] as const satisfies readonly AppLocale[]) {
    for (const [key, text] of Object.entries(MESSAGES[locale])) {
      if (key.startsWith("account.") || key.startsWith("telegram.")) {
        assert.doesNotMatch(text, /Taxi GPS/, `${locale}:${key}`);
      }
    }
  }
  for (const locale of ["uk", "ru", "en"] as const) {
    assert.ok(MESSAGES[locale]["account.overview.subtitle"].includes("Fleet GPS"), locale);
  }
});
