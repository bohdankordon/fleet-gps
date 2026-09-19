import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ConfigProvider } from "antd";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountOverview } from "./account-overview";
import type { AuthUser } from "../lib/auth/auth-contract";
import type { AccountNotificationSummaryState } from "../lib/account/account-notification-summary";

const admin: AuthUser = { id: "admin-id", login: "owner", role: "ADMIN", permissions: [], mustChangePassword: false };
const operator: AuthUser = { id: "user-id", login: "operator", role: "USER", permissions: ["fleet.view", "events.view"], mustChangePassword: true };
const available = (telegramStatus: "CONNECTED" | "BROKEN" | "NOT_CONNECTED" | "LINK_PENDING"): AccountNotificationSummaryState => ({ availability: "available", summary: { telegramStatus, preferences: { enabled: false, speedingEnabled: true, inactivityEnabled: true, vehicleScope: "ALL", selectedVehicleCount: 0, canSelectVehicles: true } } });
const render = (user: AuthUser, state: AccountNotificationSummaryState, locale: "uk" | "ru" | "en" = "en") => renderToStaticMarkup(<ConfigProvider><AccountOverview user={user} summaryState={state} locale={locale} signOutAction={<button type="button">Sign out fixture</button>} /></ConfigProvider>);

test("Overview is a unified centered workspace with a primary identity surface", () => {
  const html = render(admin, available("CONNECTED"));
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.equal((html.match(/<h2\b/g) ?? []).length, 2);
  assert.equal((html.match(/<h3\b/g) ?? []).length, 3);
  // Heading, navigation, and body share one centered axis with no wider
  // navigation override.
  const axisCss = readFileSync("src/styles/account.css", "utf8");
  assert.match(axisCss, /max-width:\s*820px/);
  assert.match(axisCss, /margin-inline:\s*auto/);
  // Identity surface: avatar with the first login letter, then login primary,
  // role secondary, access tertiary, in order.
  assert.match(html, /ant-avatar/);
  assert.match(html, /ant-avatar-string[^>]*>O</);
  const identityHtml = html.slice(html.indexOf("account-identity-card"), html.indexOf("account-settings"));
  assert.ok(identityHtml.indexOf("owner") >= 0);
  assert.ok(identityHtml.indexOf("Administrator") >= 0);
  assert.ok(identityHtml.indexOf("Full administrative authority") >= 0);
  assert.ok(identityHtml.indexOf("owner") < identityHtml.indexOf("Administrator"));
  assert.ok(identityHtml.indexOf("Administrator") < identityHtml.indexOf("Full administrative authority"));
  // One restrained surface: no Descriptions, table, or duplicated overview heading.
  assert.match(html, /account-identity-card/);
  assert.doesNotMatch(html, /account-facts|ant-descriptions|<table/);
  assert.doesNotMatch(html, /Account overview|Дані облікового запису|Данные учётной записи/);
  assert.match(html, /Password change not required/);
  assert.match(html, /Connected/);
  assert.match(html, />Off</);
  assert.doesNotMatch(html, /Paused|Призупинено|Приостановлены/);
  assert.ok(html.indexOf("Configure notifications") < html.indexOf("Sign out fixture"));
  // No editable identity controls in the workspace body (the mobile route
  // selector owns the single combobox input inside <nav>).
  const bodyHtml = html.slice(html.indexOf("account-workspace__body"));
  assert.doesNotMatch(bodyHtml, /<input|contenteditable/);
  assert.doesNotMatch(html, /auth-card|account-card|account-overview__state/);
});

test("Settings is one coherent surface with cohesive rows and text states", () => {
  const html = render(admin, available("CONNECTED"));
  // One coherent Settings list owns three rows, not floating sections.
  assert.match(html, /account-settings__list/);
  assert.equal((html.match(/account-settings__row/g) ?? []).length, 3);
  assert.match(html, />Settings</);
  // Text-based states: no dot grammar carries meaning.
  assert.doesNotMatch(html, /account-overview__state--|<details/);
  // Each contextual action follows its own row state in the same bounded row.
  // Scope to the Settings list so the route navigation links above
  // do not satisfy the ordering assertion.
  const listHtml = html.slice(html.indexOf("account-settings__list"));
  const securityHeading = listHtml.indexOf('id="account-security-heading"');
  const securityAction = listHtml.indexOf('href="/account/change-password"');
  const telegramHeading = listHtml.indexOf('id="account-telegram-heading"');
  const telegramAction = listHtml.indexOf('href="/account/telegram"');
  const notificationsHeading = listHtml.indexOf('id="account-notifications-heading"');
  const notificationsAction = listHtml.indexOf('href="/account/notifications"');
  for (const index of [securityHeading, securityAction, telegramHeading, telegramAction, notificationsHeading, notificationsAction]) assert.ok(index >= 0);
  assert.ok(securityHeading < securityAction && securityAction < telegramHeading);
  assert.ok(telegramHeading < telegramAction && telegramAction < notificationsHeading);
  assert.ok(notificationsHeading < notificationsAction);
  assert.match(html, /Change password/);
  assert.match(html, /Manage Telegram/);
  assert.match(html, /Configure notifications/);
});

test("USER access is localized, required password is prominent, and BROKEN is never not-connected", () => {
  const en = render(operator, available("BROKEN"));
  assert.match(en, /Fleet, Events/);
  assert.match(en, /Password change required/);
  assert.match(en, /Reconnect needed/);
  assert.doesNotMatch(en, />Not connected</);
  assert.doesNotMatch(en, /fleet\.view|events\.view|BROKEN/);
});

test("NOT_CONNECTED states the prerequisite once without duplicating the status", () => {
  const html = render(admin, available("NOT_CONNECTED"));
  assert.equal((html.match(/>Not connected</g) ?? []).length, 1);
  assert.match(html, /Connect Telegram to receive notifications\./);
  assert.match(html, />Off</);
  assert.doesNotMatch(html, />Not connected<.*>Not connected</s);
});

test("Telegram states use discrete Ant Tags with textual meaning", () => {
  const connected = render(admin, available("CONNECTED"));
  assert.match(connected, /ant-tag-success[^>]*>Connected</);
  const pending = render(admin, available("LINK_PENDING"));
  assert.match(pending, /ant-tag-processing[^>]*>Awaiting confirmation</);
  const notConnected = render(admin, available("NOT_CONNECTED"));
  assert.match(notConnected, /ant-tag[^>]*>Not connected</);
  assert.doesNotMatch(notConnected.slice(notConnected.indexOf('id="account-telegram-heading"'), notConnected.indexOf('id="account-notifications-heading"')), /ant-tag-success|ant-tag-warning|ant-tag-processing|ant-tag-error/);
  const broken = render(admin, available("BROKEN"));
  assert.match(broken, /ant-tag-warning[^>]*>Reconnect needed</);
  assert.match(broken, /Telegram delivery cannot use the saved connection\./);
  assert.doesNotMatch(broken, />Not connected</);
  assert.doesNotMatch(broken, /NOT_CONNECTED|LINK_PENDING|BROKEN/);
});

test("Notifications use On/Off Tags and never fabricate unavailable states", () => {
  const html = render(admin, available("CONNECTED"));
  assert.match(html, /ant-tag[^>]*>Off</);
  assert.doesNotMatch(html, /Notifications paused|Notifications enabled/);
  const unavailable = render(admin, { availability: "unavailable" } as const);
  assert.doesNotMatch(unavailable, /ant-tag/);
  assert.doesNotMatch(unavailable, />On<|>Off</);
});

test("Telegram prerequisite and delivery prerequisite stay distinct", () => {
  const html = render(admin, available("NOT_CONNECTED"));
  assert.equal((html.match(/Connect Telegram to receive notifications\./g) ?? []).length, 1);
  assert.equal((html.match(/Delivery is unavailable until Telegram is connected\./g) ?? []).length, 1);
});

test("unavailable read remains unavailable in UK, RU, and EN and never fabricates preference defaults", () => {
  const unavailable = { availability: "unavailable" } as const;
  for (const [locale, expected] of [["uk", "Статус недоступний"], ["ru", "Статус недоступен"], ["en", "Status unavailable"]] as const) {
    const html = render(admin, unavailable, locale);
    assert.equal((html.match(new RegExp(expected, "g")) ?? []).length, 2);
    assert.doesNotMatch(html, /Not connected|Не подключён|Не підключено|>Off<|Вимкнено|Выключено|All vehicles|Все автомобили|Усі автомобілі/);
    assert.match(html, /href="\/account"/);
  }
});

test("shared navigation is labelled, uses the accepted menu grammar with active state and mobile selector", () => {
  const html = render(admin, available("LINK_PENDING"));
  assert.match(html, /<nav[^>]+aria-label="Account sections"/);
  assert.match(html, /aria-current="page" href="\/account"/);
  assert.match(html, /href="\/account\/change-password"/);
  assert.match(html, /href="\/account\/telegram"/);
  assert.match(html, /href="\/account\/notifications"/);
  assert.match(html, /ant-menu/);
  assert.match(html, /ant-menu-item-selected/);
  assert.match(html, /account-navigation__desktop/);
  assert.match(html, /account-navigation__mobile/);
  assert.match(html, /ant-select/);
  assert.match(html, /Section/);
  assert.match(html, /Awaiting confirmation/);
});

test("Overview server boundary uses the session-only authenticated fetch and no legacy auth-card composition", () => {
  const page = readFileSync("src/app/account/page.tsx", "utf8");
  const serverRead = readFileSync("src/lib/account/account-notification-summary-server.ts", "utf8");
  const telegramCompatibility = readFileSync("src/app/account/telegram/page.tsx", "utf8");
  assert.match(page, /<AccountOverview/);
  assert.doesNotMatch(page, /auth-page|auth-card|account-card|cookies\(/);
  assert.match(serverRead, /authenticatedApiFetch/);
  assert.doesNotMatch(serverRead, /cookies\(|Cookie|jar\.toString/);
  // Screen 3 replaced the compatibility redirect with the real workspace,
  // still behind the session-only server boundary.
  assert.match(telegramCompatibility, /<AccountTelegram/);
  assert.match(telegramCompatibility, /loadAccountTelegramState/);
  assert.doesNotMatch(telegramCompatibility, /cookies\(|jar\.toString|redirect\(/);
});

test("settings copy is localized in UK, RU, and EN", () => {
  const expected = {
    uk: { title: "Налаштування", off: "Вимкнено", on: "Увімкнено", connect: "Підключіть Telegram, щоб отримувати сповіщення.", delivery: "Доставка недоступна, доки Telegram не підключено.", broken: "Доставка Telegram не може використовувати збережене підключення." },
    ru: { title: "Настройки", off: "Выключено", on: "Включено", connect: "Подключите Telegram, чтобы получать уведомления.", delivery: "Доставка недоступна, пока Telegram не подключён.", broken: "Доставка Telegram не может использовать сохранённое подключение." },
    en: { title: "Settings", off: "Off", on: "On", connect: "Connect Telegram to receive notifications.", delivery: "Delivery is unavailable until Telegram is connected.", broken: "Telegram delivery cannot use the saved connection." },
  } as const;
  const enabledState: AccountNotificationSummaryState = { availability: "available", summary: { telegramStatus: "CONNECTED", preferences: { enabled: true, speedingEnabled: false, inactivityEnabled: false, vehicleScope: "ALL", selectedVehicleCount: 0, canSelectVehicles: true } } };
  for (const locale of ["uk", "ru", "en"] as const) {
    const copy = expected[locale];
    const disconnected = render(admin, available("NOT_CONNECTED"), locale);
    for (const text of [copy.title, copy.off, copy.connect, copy.delivery]) assert.ok(disconnected.includes(text), `${locale}: ${text}`);
    const enabled = render(admin, enabledState, locale);
    assert.ok(enabled.includes(`>${copy.on}<`), `${locale}: on tag`);
    const broken = render(admin, available("BROKEN"), locale);
    assert.ok(broken.includes(copy.broken), `${locale}: broken help`);
  }
});

test("sign out uses the restrained Ant danger treatment", () => {
  // Both Account screens share one sign-out surface with the restrained
  // Ant danger action; the CSS contract below pins its hover/focus/active.
  const shared = readFileSync("src/components/account-sign-out-section.tsx", "utf8");
  assert.match(shared, /<LogoutButton danger \/>/);
  assert.doesNotMatch(shared, /danger="primary"|type="primary"/);
  const overview = readFileSync("src/components/account-overview.tsx", "utf8");
  assert.match(overview, /<AccountSignOutSection/);
});

test("danger hover/focus treatment is scoped and other Logout usages are unchanged", () => {
  const css = readFileSync("src/styles/account.css", "utf8");
  assert.match(css, /\.account-signout__action \.ant-btn\.ant-btn-dangerous/);
  assert.match(css, /:hover/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /:active/);
  // Hover fill is Ant's `colorError` (the header dropdown danger red), not
  // the project's dark custom danger token; active is `colorErrorActive`.
  assert.match(css, /#ff4d4f/);
  assert.match(css, /#d9363e/);
  assert.doesNotMatch(css, /--color-danger-foreground/);
  assert.doesNotMatch(css, /^\.ant-btn-dangerous/m);
  // The change-password route renders inside the Account Security surface,
  // which reuses the same shared sign-out surface as Overview.
  const changePassword = readFileSync("src/components/account-security.tsx", "utf8");
  assert.match(changePassword, /<AccountSignOutSection/);
  assert.doesNotMatch(changePassword, /<LogoutButton/);
});

test("identity avatar shows the first login letter neutrally and stays hidden from assistive tech", () => {
  // The avatar owns its rendered size: the chained Ant class keeps the
  // 68px/56px rule strictly above Ant's injected `.ant-avatar` 32px rule.
  const avatarCss = readFileSync("src/styles/account.css", "utf8");
  assert.match(avatarCss, /\.account-identity__avatar\.ant-avatar/);
  assert.match(avatarCss, /width:\s*68px/);
  const adminHtml = render(admin, available("CONNECTED"));
  assert.match(adminHtml, /ant-avatar/);
  assert.match(adminHtml, /aria-hidden="true"/);
  assert.match(adminHtml, /ant-avatar-string[^>]*>O</);
  const userHtml = render(operator, available("CONNECTED"));
  assert.match(userHtml, /ant-avatar-string[^>]*>O</);
  const martaHtml = render({ ...operator, login: "marta99" }, available("CONNECTED"));
  assert.match(martaHtml, /ant-avatar-string[^>]*>M</);
  assert.doesNotMatch(adminHtml, /ant-avatar[^>]*ant-avatar-success|ant-avatar-warning/);
  assert.ok(userHtml.indexOf("operator") < userHtml.indexOf(">User<"));
});

test("account navigation keeps the shared centered axis without a wider override", () => {
  const css = readFileSync("src/styles/account.css", "utf8");
  const start = css.indexOf(".account-navigation {");
  assert.ok(start >= 0);
  const block = css.slice(start, css.indexOf("}", start));
  assert.doesNotMatch(block, /margin/);
});

test("sign-out surface shares the settings surface geometry", () => {
  const css = readFileSync("src/styles/account.css", "utf8");
  const start = css.indexOf(".account-signout {");
  assert.ok(start >= 0);
  const block = css.slice(start, css.indexOf("}", start));
  assert.match(block, /padding:\s*var\(--space-6\)/);
  assert.match(block, /border-radius:\s*var\(--radius-lg\)/);
});
