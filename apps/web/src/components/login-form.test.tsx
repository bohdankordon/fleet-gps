import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Form } from "antd";
import { LoginFormView, type LoginFormValues } from "./login-form-view";
import type { LoginFormError } from "../lib/auth/login-form-core";
import { landingFor } from "../lib/auth/auth-contract";
import { createTranslator } from "../i18n/core";
import { MESSAGE_CATALOG } from "../i18n/messages";

function render(error: LoginFormError | null = null, busy = false): string {
  function Harness() {
    const [form] = Form.useForm<LoginFormValues>();
    const summaryRef = useRef<HTMLDivElement | null>(null);
    return (
      <LoginFormView
        form={form}
        busy={busy}
        locked={busy}
        error={error}
        summaryRef={summaryRef}
        onFinish={() => undefined}
        onFinishFailed={() => undefined}
      />
    );
  }
  return renderToStaticMarkup(<Harness />);
}

const viewSource = readFileSync("src/components/login-form-view.tsx", "utf8");
const formSource = readFileSync("src/components/login-form.tsx", "utf8");
const coreSource = readFileSync("src/lib/auth/login-form-core.ts", "utf8");
const pageSource = readFileSync("src/app/login/page.tsx", "utf8");
const loginCss = readFileSync("src/styles/login.css", "utf8");

test("idle login renders one bounded form with visible labels and no secondary actions", () => {
  const html = render();
  assert.equal(html.match(/<form\b/g)?.length ?? 0, 1);
  assert.match(html, /login-card__form/);
  assert.ok(html.includes("\u041b\u043e\u0433\u0438\u043d"));
  assert.ok(html.includes("\u041f\u0430\u0440\u043e\u043b\u044c"));
  assert.ok(html.includes("\u0412\u043e\u0439\u0442\u0438"));
  assert.doesNotMatch(html, /Taxi GPS/);
  assert.doesNotMatch(html, /formaction=|onkeydown=/i);
});

test("login posts to the established same-origin contract and never a credential query", () => {
  const html = render();
  assert.match(html, /<form[^>]*action="\/api\/auth\/login"[^>]*method="post"/);
  assert.doesNotMatch(html, /method="get"|action="[^"]*\?/i);
  assert.doesNotMatch(html, /[?&](?:login|password)=/i);
  assert.match(coreSource, /JSON\.stringify\(\{ login, password \}\)/);
  assert.doesNotMatch(formSource, /\.trim\(\)/);
  assert.doesNotMatch(coreSource, /\.trim\(\)/);
});

test("login subtitle and metadata use Fleet GPS in UK/RU/EN", () => {
  for (const locale of ["ru", "uk", "en"] as const) {
    const t = createTranslator(locale);
    assert.ok(t("auth.login.subtitle").includes("Fleet GPS"));
    assert.ok(t("auth.login.metaTitle").includes("Fleet GPS"));
    assert.equal(t("auth.login.subtitle").includes("Taxi GPS"), false);
  }
  assert.equal(createTranslator("en")("auth.login.subtitle"), "Access your Fleet GPS workspace.");
  assert.match(pageSource, /auth\.login\.subtitle/);
  assert.match(pageSource, /auth\.login\.metaTitle/);
});

test("login keeps local required and malformed validation cases", () => {
  assert.match(viewSource, /auth\.login\.loginRequired/);
  assert.match(viewSource, /LOGIN_PATTERN/);
  assert.match(viewSource, /auth\.login\.loginInvalid/);
  assert.match(viewSource, /auth\.login\.passwordRequired/);
  assert.doesNotMatch(viewSource, /15.*128|128.*15/);
});

test("first invalid field receives focus instead of a detached error", () => {
  assert.match(formSource, /scrollToField/);
  assert.match(formSource, /onFinishFailed/);
});

test("401 stays a generic credentials state without enumerating reasons", () => {
  const html = render("INVALID_CREDENTIALS");
  assert.match(html, /role="alert"/);
  const text = createTranslator("en")("auth.login.invalidCredentials");
  assert.equal(/user not found|account disabled|wrong password/i.test(text), false);
  assert.match(formSource, /invalid-credentials[\s\S]*INVALID_CREDENTIALS/);
});

test("401 and 429 clear only the password while preserving login", () => {
  const clears = formSource.match(/setFieldValue\("password", ""\)/g) ?? [];
  assert.equal(clears.length, 1);
  assert.match(formSource, /if \(result\.kind === "invalid-credentials" \|\| result\.kind === "rate-limited"\)/);
  assert.doesNotMatch(formSource, /setFieldValue\("login"/);
  assert.doesNotMatch(formSource, /setFieldsValue\(\{ login/);
});

test("429 uses the safe localized rate-limit state", () => {
  const html = render("RATE_LIMITED");
  assert.match(html, /role="alert"/);
  assert.match(formSource, /rate-limited[\s\S]*RATE_LIMITED/);
  assert.doesNotMatch(formSource, /countdown|remaining|15 minutes/i);
});

test("unavailable preserves retry values and never leaks raw bodies", () => {
  const html = render("UNAVAILABLE");
  assert.match(html, /role="alert"/);
  assert.match(formSource, /UNAVAILABLE/);
  assert.doesNotMatch(formSource, /response\.text|\.message\s*\?\?|JSON\.stringify\(result\)/);
});

test("pending locks every control with a stable loading action", () => {
  const html = render(null, true);
  assert.ok(html.includes(createTranslator("ru")("auth.login.submitting")));
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled/);
  assert.match(viewSource, /disabled=\{locked\}/);
  assert.match(viewSource, /loading=\{busy\}/);
  assert.match(viewSource, /aria-busy=\{busy\}/);
});

test("duplicate submits share one synchronous ref guard that survives success", () => {
  assert.match(formSource, /busyRef\.current \|\| succeeded/);
  assert.match(formSource, /busyRef\.current = true/);
});

test("stale responses cannot overwrite newer state and unmount aborts flight", () => {
  assert.match(formSource, /generation\.current !== run/);
  assert.match(formSource, /new AbortController\(\)/);
  assert.match(formSource, /aborter\.current\?\.abort\(\)/);
  assert.match(formSource, /attemptLogin\(login, password, fetch, controller\.signal\)/);
});

test("success navigates through the unchanged landing contract", () => {
  assert.match(formSource, /router\.replace\(landingFor\(result\.user\)\)/);
  assert.match(formSource, /router\.refresh\(\)/);
  assert.match(formSource, /setSucceeded\(true\)/);
});

test("landing keeps mustChangePassword first and no-access last", () => {
  const forced = { id: "u", login: "op", role: "USER", permissions: ["fleet.view"], mustChangePassword: true } as const;
  assert.equal(landingFor({ ...forced }), "/account/change-password");
  assert.equal(landingFor({ id: "u", login: "op", role: "USER", permissions: [], mustChangePassword: false }), "/account/no-access");
  assert.equal(landingFor({ id: "a", login: "admin", role: "ADMIN", permissions: [], mustChangePassword: false }), "/");
});

test("authenticated GET on login still redirects without redirect query support", () => {
  assert.match(pageSource, /getAuthUser\(\)/);
  assert.match(pageSource, /redirect\(landingFor\(user\)\)/);
  assert.doesNotMatch(pageSource, /returnTo|callback|redirect\?|searchParams/i);
  assert.doesNotMatch(render(), /returnTo|callbackUrl/i);
});

test("login inputs expose the approved autocomplete hints", () => {
  const html = render();
  assert.match(html, /name="login"[^>]*autocomplete="username"|autocomplete="username"[^>]*name="login"/i);
  assert.match(html, /name="password"[^>]*autocomplete="current-password"|autocomplete="current-password"[^>]*name="password"/i);
});

test("form-level errors use alert semantics with an accessible summary target", () => {
  const html = render("UNAVAILABLE");
  assert.match(html, /role="alert"/);
  assert.match(html, /login-card__summary/);
  assert.match(viewSource, /summaryRef/);
  assert.match(formSource, /focusSummary\(\)|focusPassword\(\)/);
});

test("mobile contract keeps touch targets and zoom-safe inputs", () => {
  assert.match(loginCss, /min-height: 44px/);
  assert.match(loginCss, /font-size: 16px/);
  assert.match(viewSource, /block/);
});
test("intro-to-form gap owns the Ant form margin reset", () => {
  assert.match(loginCss, /\.login-card__form\.ant-form\s*\{[^}]*margin-top/);
  assert.match(loginCss, /margin-top: var\(--space-6\)/);
});

test("login no longer owns the legacy auth-page auth-card composition", () => {
  assert.doesNotMatch(pageSource, /auth-page|auth-card|auth-form/);
  assert.doesNotMatch(viewSource, /auth-form|className="auth-/);
  assert.match(pageSource, /login-page/);
  assert.match(pageSource, /login-card/);
  assert.match(pageSource, /<h1/);
  assert.equal((pageSource.match(/<h1/g) ?? []).length, 1);
});

test("no visible login copy uses Taxi GPS", () => {
  for (const locale of ["ru", "uk", "en"] as const) {
    for (const key of ["auth.login.title", "auth.login.subtitle", "auth.login.metaTitle", "auth.login.submit", "auth.login.submitting"] as const) {
      assert.equal(createTranslator(locale)(key).includes("Taxi GPS"), false);
    }
  }
  assert.equal(MESSAGE_CATALOG["auth.login.subtitle"].en.includes("Fleet GPS"), true);
});
