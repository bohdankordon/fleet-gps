import "../test-setup-alias";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ConfigProvider } from "antd";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountSecurity } from "./account-security";
import type { AuthUser } from "../lib/auth/auth-contract";
import { MESSAGE_CATALOG } from "../i18n/messages";

const voluntary: AuthUser = { id: "user-id", login: "operator", role: "USER", permissions: ["fleet.view"], mustChangePassword: false };
const mandatory: AuthUser = { ...voluntary, mustChangePassword: true };
const render = (user: AuthUser, locale: "uk" | "ru" | "en" = "en") => renderToStaticMarkup(<ConfigProvider><AccountSecurity user={user} locale={locale} signOutAction={<button type="button">Sign out fixture</button>} formAction={<form data-testid="password-form-fixture" />} /></ConfigProvider>);

test("normal Security keeps tabs, sessions, and centered workspace without status or duplicated policy", () => {
  const html = render(voluntary);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.equal((html.match(/<h2\b/g) ?? []).length, 2);
  assert.match(html, />Security</);
  assert.match(html, /Manage the password for your Fleet GPS account\./);
  const axisCss = readFileSync("src/styles/account.css", "utf8");
  assert.match(axisCss, /max-width:\s*820px/);
  assert.match(axisCss, /margin-inline:\s*auto/);
  assert.match(html, /<nav[^>]+aria-label="Account sections"/);
  assert.match(html, /aria-current="page" href="\/account\/change-password"/);
  assert.match(html, /account-navigation__desktop/);
  assert.match(html, /account-navigation__mobile/);
  assert.match(html, /account-security-card/);
  assert.match(html, /account-security__inner/);
  assert.match(html, /account-security__context/);
  assert.match(html, /account-security__divider/);
  // Context precedes the divider, the working form follows it.
  assert.ok(html.indexOf("account-security__context") < html.indexOf("account-security__divider"));
  assert.ok(html.indexOf("account-security__divider") < html.indexOf("password-form-fixture"));
  assert.match(html, /password-form-fixture/);
  assert.match(html, /account-signout/);
  assert.ok(html.indexOf("password-form-fixture") < html.indexOf("Sign out fixture"));
  assert.doesNotMatch(html, /auth-page|auth-card|account-card|account-heading|account-actions/);
  const bodyHtml = html.slice(html.indexOf("account-workspace__body"));
  assert.doesNotMatch(bodyHtml, /<input|contenteditable/);
  // Normal polish: no Status fact, no standalone Password Requirements fact.
  assert.doesNotMatch(html, />Status</);
  assert.doesNotMatch(html, /Password change not required/);
  assert.doesNotMatch(html, />Password requirements</);
  assert.doesNotMatch(html, /common passwords are not accepted/);
  // Sessions fact remains the single context fact.
  assert.match(html, />Sessions</);
  assert.match(html, /Changing the password ends all other sessions\. This browser stays signed in\./);
  assert.doesNotMatch(html, /ant-alert-warning/);
  // Normal card heading keeps ordinary change language.
  assert.match(html, />Change password</);
  assert.doesNotMatch(html, />Create password</);
});

test("mandatory onboarding hides tabs and uses onboarding copy with warning", () => {
  const html = render(mandatory);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /Create your own password/);
  assert.match(html, /Before using Fleet GPS, replace the temporary password with your own\./);
  assert.match(html, /ant-alert-warning/);
  assert.match(html, /Access to Fleet GPS is restricted until you create your own password\./);
  assert.match(html, />Create password</);
  assert.doesNotMatch(html, />Change password</);
  assert.doesNotMatch(html, /<nav[^>]+aria-label="Account sections"/);
  assert.doesNotMatch(html, /account-navigation__desktop/);
  assert.doesNotMatch(html, /Back to Account/);
  assert.doesNotMatch(html, />Status</);
  assert.doesNotMatch(html, /Password change not required/);
  assert.doesNotMatch(html, />Password requirements</);
  assert.match(html, />Sessions</);
  assert.match(html, /Changing the password ends all other sessions/);
  assert.match(html, /password-form-fixture/);
  assert.match(html, /Sign out fixture/);
  assert.match(html, /account-signout/);
});

test("security copy is localized in UK, RU, and EN with single policy helper", () => {
  const expected = {
    uk: {
      title: "Безпека",
      subtitle: "Керуйте паролем свого облікового запису Fleet GPS.",
      normalHeading: "Змінити пароль",
      mandatoryHeading: "Створити пароль",
      mandatoryTitle: "Створіть власний пароль",
      mandatorySubtitle: "Перш ніж користуватися Fleet GPS, замініть тимчасовий пароль на власний.",
      mandatoryWarning: "Доступ до Fleet GPS обмежено, доки ви не створите власний пароль.",
      temporary: "Тимчасовий пароль",
      sessions: "Сеанси",
      sessionsNote: "Зміна пароля завершить усі інші сеанси.",
    },
    ru: {
      title: "Безопасность",
      subtitle: "Управляйте паролем своей учётной записи Fleet GPS.",
      normalHeading: "Изменить пароль",
      mandatoryHeading: "Создать пароль",
      mandatoryTitle: "Создайте свой пароль",
      mandatorySubtitle: "Прежде чем пользоваться Fleet GPS, замените временный пароль своим.",
      mandatoryWarning: "Доступ к Fleet GPS ограничен, пока вы не создадите свой пароль.",
      temporary: "Временный пароль",
      sessions: "Сеансы",
      sessionsNote: "Смена пароля завершит все остальные сеансы.",
    },
    en: {
      title: "Security",
      subtitle: "Manage the password for your Fleet GPS account.",
      normalHeading: "Change password",
      mandatoryHeading: "Create password",
      mandatoryTitle: "Create your own password",
      mandatorySubtitle: "Before using Fleet GPS, replace the temporary password with your own.",
      mandatoryWarning: "Access to Fleet GPS is restricted until you create your own password.",
      temporary: "Temporary password",
      sessions: "Sessions",
      sessionsNote: "Changing the password ends all other sessions.",
    },
  } as const;
  for (const locale of ["uk", "ru", "en"] as const) {
    const copy = expected[locale];
    const calm = render(voluntary, locale);
    for (const text of [copy.title, copy.subtitle, copy.normalHeading, copy.sessions, copy.sessionsNote]) {
      assert.ok(calm.includes(text), `${locale}: ${text}`);
    }
    assert.ok(!calm.includes(`>${copy.mandatoryHeading}<`), `${locale}: no mandatory heading when normal`);
    const forced = render(mandatory, locale);
    for (const text of [copy.mandatoryTitle, copy.mandatorySubtitle, copy.mandatoryWarning, copy.mandatoryHeading, copy.sessions, copy.sessionsNote]) {
      assert.ok(forced.includes(text), `${locale}: ${text}`);
    }
    assert.ok(MESSAGE_CATALOG["auth.password.createTitle"][locale].includes(copy.mandatoryHeading), `${locale}: create title`);
    assert.ok(MESSAGE_CATALOG["auth.password.help"][locale].includes("12–128"), `${locale}: helper length`);
    assert.ok(MESSAGE_CATALOG["auth.password.temporary"][locale].includes(copy.temporary), `${locale}: temporary`);
    assert.ok(MESSAGE_CATALOG["account.security.mandatoryTitle"][locale].includes(copy.mandatoryTitle), `${locale}: mandatory title`);
    assert.ok(MESSAGE_CATALOG["account.security.mandatorySubtitle"][locale].includes(copy.mandatorySubtitle), `${locale}: mandatory subtitle`);
    assert.ok(MESSAGE_CATALOG["account.security.mandatoryWarning"][locale].includes(copy.mandatoryWarning), `${locale}: mandatory warning`);
    assert.ok(MESSAGE_CATALOG["auth.password.commonOrPredictable"][locale].length > 20, `${locale}: common-password rejection`);
    assert.ok(MESSAGE_CATALOG["auth.password.sameAsCurrent"][locale].length > 20, `${locale}: same-password rejection`);
  }
});

test("security context is sessions-only with sign-out and no back escape", () => {
  for (const user of [voluntary, mandatory] as const) {
    const html = render(user);
    assert.match(html, />Sessions</);
    assert.doesNotMatch(html, />Status</);
    assert.doesNotMatch(html, />Password requirements</);
    assert.doesNotMatch(html, /Back to Account/);
    assert.match(html, /password-form-fixture/);
    assert.match(html, /account-signout/);
    assert.doesNotMatch(html, /igned in as /);
  }
  const security = readFileSync("src/components/account-security.tsx", "utf8");
  assert.match(security, /const mandatory = user\.mustChangePassword === true/);
  assert.match(security, /mandatory \? t\("account\.security\.mandatoryTitle"\)/);
  assert.match(security, /mandatory \? t\("account\.security\.mandatorySubtitle"\)/);
  assert.match(security, /t\("account\.security\.mandatoryWarning"\)/);
  assert.match(security, /t\(mandatory \? "auth\.password\.createTitle" : "auth\.password\.title"\)/);
  assert.match(security, /\{mandatory \? null : <AccountNavigation/);
  assert.doesNotMatch(security, /requiredAlert/);
  assert.doesNotMatch(security, /requirementsLabel|requirementsValue/);
  assert.doesNotMatch(security, /common\.status/);
  assert.match(security, /<AccountSecurityForm mandatory=\{mandatory\} \/>/);
  assert.match(security, /<AccountSignOutSection/);
  assert.doesNotMatch(security, /<LogoutButton/);
  assert.doesNotMatch(security, /telegram|notifications|no-access/i);
  const form = readFileSync("src/components/account-security-form.tsx", "utf8");
  assert.match(form, /t\(mandatory \? "auth\.password\.temporary" : "auth\.password\.current"\)/);
  assert.match(form, /auth\.password\.help/);
  assert.equal((form.match(/auth\.password\.help/g) ?? []).length, 1);
  assert.doesNotMatch(form, /backToAccount/);
  assert.doesNotMatch(form, /href="\/account"/);
});

test("password contract is preserved: same endpoint, payload, and error mapping", () => {
  const form = readFileSync("src/components/account-security-form.tsx", "utf8");
  assert.equal((form.match(/fetch\("\/api\/auth\/change-password"/g) ?? []).length, 1);
  assert.match(form, /buildChangePasswordPayload\(values\)/);
  assert.match(form, /method: "POST"/);
  assert.match(form, /auth\.password\.invalidCurrent/);
  assert.match(form, /changePasswordErrorKey/);
  assert.match(form, /auth\.password\.help/);
  assert.match(form, /auth\.password\.unavailable/);
  assert.doesNotMatch(form, /body\.message|\.message\s*\?\?/);
  // The password never travels in a URL, storage, log, or analytics event.
  assert.doesNotMatch(form, /localStorage|sessionStorage|console\.|URLSearchParams|\?password|analytics/);
  assert.doesNotMatch(form, /SecLists|SHA-256|common-passwords\.bin|blocklist/i);
  // Native controls keep their password-manager contract.
  assert.match(form, /autoComplete="current-password"/);
  assert.equal((form.match(/autoComplete="new-password"/g) ?? []).length, 2);
  assert.doesNotMatch(form, /maxLength/);
  // Duplicate submits, late responses, and unmounts cannot corrupt state.
  assert.match(form, /busyRef\.current/);
  assert.match(form, /generation\.current !== run/);
  assert.match(form, /AbortController/);
  assert.match(form, /scrollToField/);
  assert.match(form, /parseAuthUser\(await response\.json\(\)\)/);
  assert.match(form, /router\.replace\(landingFor\(user\)\)/);
  assert.match(form, /router\.refresh\(\)/);
  // Mandatory presentation uses the Temporary label; Back escape is gone.
  assert.match(form, /auth\.password\.temporary/);
  assert.doesNotMatch(form, /backToAccount/);
  assert.doesNotMatch(form, /href="\/account"/);
  const page = readFileSync("src/app/account/change-password/page.tsx", "utf8");
  assert.match(page, /<AccountSecurity/);
  assert.doesNotMatch(page, /auth-page|auth-card|account-card|account-actions/);
});

test("security surface keeps the Account rhythm without touching overview geometry", () => {
  const css = readFileSync("src/styles/account.css", "utf8");
  // One deliberate centered working column bounds context and form.
  const start = css.indexOf(".account-security__inner {");
  assert.ok(start >= 0);
  const block = css.slice(start, css.indexOf("}", start));
  assert.match(block, /max-width:\s*610px/);
  assert.match(block, /margin-inline:\s*auto/);
});
