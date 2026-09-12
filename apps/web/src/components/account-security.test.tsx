import "../test-setup-alias";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ConfigProvider } from "antd";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountSecurity } from "./account-security";
import type { AuthUser } from "../lib/auth/auth-contract";

const voluntary: AuthUser = { id: "user-id", login: "operator", role: "USER", permissions: ["fleet.view"], mustChangePassword: false };
const mandatory: AuthUser = { ...voluntary, mustChangePassword: true };
const render = (user: AuthUser, locale: "uk" | "ru" | "en" = "en") => renderToStaticMarkup(<ConfigProvider><AccountSecurity user={user} locale={locale} signOutAction={<button type="button">Sign out fixture</button>} formAction={<form data-testid="password-form-fixture" />} /></ConfigProvider>);

test("Security reuses the shared centered Account workspace and navigation", () => {
  const html = render(voluntary);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.equal((html.match(/<h2\b/g) ?? []).length, 2);
  assert.ok((html.match(/<h3\b/g) ?? []).length >= 3);
  assert.match(html, />Security</);
  assert.match(html, /Manage the password for your Taxi GPS account\./);
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
});

test("mandatory password change is prominent while voluntary change stays quiet", () => {
  const forced = render(mandatory);
  assert.match(forced, /ant-alert-warning/);
  assert.match(forced, /You must change your password before continuing\./);
  const calm = render(voluntary);
  assert.doesNotMatch(calm, /ant-alert-warning/);
  assert.doesNotMatch(calm, /You must change your password before continuing\./);
  assert.match(calm, /Password change not required/);
});

test("security copy is localized in UK, RU, and EN", () => {
  const expected = {
    uk: {
      title: "Безпека",
      subtitle: "Керуйте паролем свого облікового запису Taxi GPS.",
      status: "Статус",
      quiet: "Змінювати пароль не потрібно",
      sessions: "Сеанси",
      sessionsNote: "Зміна пароля завершить усі інші сеанси.",
      requirements: "Вимоги до пароля",
      requirementsValue: "15–128 символів. Пробіли дозволені.",
      forced: "Потрібно змінити пароль, перш ніж продовжити роботу.",
    },
    ru: {
      title: "Безопасность",
      subtitle: "Управляйте паролем своей учётной записи Taxi GPS.",
      status: "Статус",
      quiet: "Изменение пароля не требуется",
      sessions: "Сеансы",
      sessionsNote: "Смена пароля завершит все остальные сеансы.",
      requirements: "Требования к паролю",
      requirementsValue: "15–128 символов. Пробелы допускаются.",
      forced: "Необходимо изменить пароль, прежде чем продолжить работу.",
    },
    en: {
      title: "Security",
      subtitle: "Manage the password for your Taxi GPS account.",
      status: "Status",
      quiet: "Password change not required",
      sessions: "Sessions",
      sessionsNote: "Changing the password ends all other sessions.",
      requirements: "Password requirements",
      requirementsValue: "15–128 characters. Spaces are allowed.",
      forced: "You must change your password before continuing.",
    },
  } as const;
  for (const locale of ["uk", "ru", "en"] as const) {
    const copy = expected[locale];
    const calm = render(voluntary, locale);
    for (const text of [copy.title, copy.subtitle, copy.status, copy.quiet, copy.sessions, copy.sessionsNote, copy.requirements, copy.requirementsValue]) {
      assert.ok(calm.includes(text), `${locale}: ${text}`);
    }
    assert.ok(render(mandatory, locale).includes(copy.forced), `${locale}: forced`);
  }
});

test("voluntary context is structured with status, sessions, and requirements", () => {
  const html = render(voluntary);
  // Status, session consequence, and password requirement read as three
  // distinct labelled facts; identity prose stays out of this surface.
  assert.match(html, />Status</);
  assert.match(html, /ant-tag[^>]*>Password change not required</);
  assert.doesNotMatch(html.slice(html.indexOf('id="account-security-heading"'), html.indexOf("account-security__divider")), /ant-tag-success|ant-tag-warning|ant-tag-processing|ant-tag-error/);
  assert.match(html, />Sessions</);
  assert.match(html, /Changing the password ends all other sessions\. This browser stays signed in\./);
  assert.match(html, />Password requirements</);
  assert.match(html, /15–128 characters\. Spaces are allowed\./);
  assert.doesNotMatch(html, /igned in as /);
  assert.match(html, /password-form-fixture/);
  const security = readFileSync("src/components/account-security.tsx", "utf8");
  assert.match(security, /<AccountSecurityForm mandatory=\{user\.mustChangePassword\} \/>/);
  assert.match(security, /<AccountSignOutSection/);
  assert.doesNotMatch(security, /<LogoutButton/);
  // The Back escape lives in the working form and only for voluntary users.
  const form = readFileSync("src/components/account-security-form.tsx", "utf8");
  assert.match(form, /\{!mandatory \? <Button href="\/account"/);
  assert.match(form, /account\.security\.backToAccount/);
  assert.doesNotMatch(security, /telegram|notifications|no-access/i);
});

test("password contract is preserved: same endpoint, payload, and error mapping", () => {
  const form = readFileSync("src/components/account-security-form.tsx", "utf8");
  assert.equal((form.match(/fetch\("\/api\/auth\/change-password"/g) ?? []).length, 1);
  assert.match(form, /buildChangePasswordPayload\(values\)/);
  assert.match(form, /method: "POST"/);
  assert.match(form, /auth\.password\.invalidCurrent/);
  assert.match(form, /auth\.password\.invalidNew/);
  assert.match(form, /auth\.password\.unavailable/);
  assert.doesNotMatch(form, /body\.message|\.message\s*\?\?/);
  // The password never travels in a URL, storage, log, or analytics event.
  assert.doesNotMatch(form, /localStorage|sessionStorage|console\.|URLSearchParams|\?password|analytics/);
  // Native controls keep their password-manager contract.
  assert.match(form, /autoComplete="current-password"/);
  assert.equal((form.match(/autoComplete="new-password"/g) ?? []).length, 2);
  // Duplicate submits, late responses, and unmounts cannot corrupt state.
  assert.match(form, /busyRef\.current/);
  assert.match(form, /generation\.current !== run/);
  assert.match(form, /AbortController/);
  assert.match(form, /scrollToField/);
  assert.match(form, /router\.replace\(landingFor\(user\)\)/);
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
