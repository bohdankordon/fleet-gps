import "../test-setup-alias";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Button, ConfigProvider } from "antd";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/client";
import type { AppLocale } from "../i18n/locales";
import { MESSAGES } from "../i18n/messages";
import { AuxiliaryState } from "../components/auxiliary-state";
import RootError from "./error";

const notFoundSource = readFileSync("src/app/not-found.tsx", "utf8");
const errorSource = readFileSync("src/app/error.tsx", "utf8");
const forbiddenSource = readFileSync("src/app/forbidden/page.tsx", "utf8");
const forbiddenStateSource = readFileSync("src/components/forbidden-state.tsx", "utf8");
const adminNotFoundSource = readFileSync("src/app/admin/users/[userId]/not-found.tsx", "utf8");
const settingsLoadingSource = readFileSync("src/app/admin/settings/loading.tsx", "utf8");
const auxiliarySource = readFileSync("src/components/auxiliary-state.tsx", "utf8");
const componentStyles = readFileSync("src/styles/components.css", "utf8");

function renderWithLocale(locale: AppLocale, children: React.ReactNode): string {
  return renderToStaticMarkup(
    <ConfigProvider>
      <I18nProvider locale={locale}>{children}</I18nProvider>
    </ConfigProvider>,
  );
}

test("root not-found is a Fleet GPS-owned compact surface with safe navigation", () => {
  assert.match(notFoundSource, /<AuxiliaryState/);
  assert.match(notFoundSource, /className="auxiliary-state-page"/);
  assert.match(notFoundSource, /notFound\.title/);
  assert.match(notFoundSource, /notFound\.body/);
  assert.match(notFoundSource, /<Button type="default" size="large" href="\/"/);
  assert.match(notFoundSource, /vehicle\.backToFleet/);
  assert.doesNotMatch(notFoundSource, /PageHeader|type="primary"/);
  assert.doesNotMatch(notFoundSource, /redirect|pathname|params|searchParams|useRouter|generateMetadata/i);
  assert.doesNotMatch(notFoundSource, /Taxi GPS|Таксопарк|Taxi fleet/);
  const expected = {
    uk: ["Сторінку не знайдено", "Сторінка, яку ви шукаєте, не існує або більше недоступна."],
    ru: ["Страница не найдена", "Страница, которую вы ищете, не существует или больше недоступна."],
    en: ["Page not found", "The page you’re looking for doesn’t exist or is no longer available."],
  } as const;
  for (const locale of ["uk", "ru", "en"] as const satisfies readonly AppLocale[]) {
    assert.equal(MESSAGES[locale]["notFound.title"], expected[locale][0]);
    assert.equal(MESSAGES[locale]["notFound.body"], expected[locale][1]);
  }
});

test("root error boundary renders safe copy and retries through reset()", () => {
  assert.match(errorSource, /"use client"/);
  assert.match(errorSource, /<AuxiliaryState/);
  assert.match(errorSource, /className="auxiliary-state-page"/);
  assert.match(errorSource, /error\.title/);
  assert.match(errorSource, /error\.body/);
  assert.match(errorSource, /common\.retry/);
  assert.match(errorSource, /<Button type="primary" size="large"/);
  assert.match(errorSource, /onClick=\{\(\) => reset\(\)\}/);
  assert.doesNotMatch(errorSource, /PageHeader/);
  assert.doesNotMatch(errorSource, /error\.message|error\.stack|error\.digest|String\(error\)|JSON\.stringify\(error\)/);
  assert.doesNotMatch(errorSource, /console\.|cookie|session|taxi_session/i);
  const html = renderWithLocale(
    "en",
    <RootError
      error={Object.assign(new Error("secret-message"), { stack: "secret-stack", digest: "secret-digest" })}
      reset={() => undefined}
    />,
  );
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.ok(html.includes("Something went wrong"));
  assert.ok(html.includes("Retry"));
  assert.match(html, /<button/);
  for (const secret of ["secret-message", "secret-stack", "secret-digest"]) assert.equal(html.includes(secret), false);
});

test("admin user not-found keeps identity, navigation, and a real h1", () => {
  assert.match(adminNotFoundSource, /admin-user-detail-v2__back/);
  assert.match(adminNotFoundSource, /<AdminNavigationTabs \/>/);
  assert.match(adminNotFoundSource, /<AuxiliaryState/);
  assert.match(adminNotFoundSource, /admin\.user\.detail\.notFoundText/);
  assert.match(adminNotFoundSource, /admin\.user\.detail\.backToUsers/);
  assert.doesNotMatch(adminNotFoundSource, /EmptyState|PageHeader|action=/);
});

test("admin settings loading announces meaningful text without visual redesign", () => {
  assert.match(settingsLoadingSource, /role="status"/);
  assert.match(settingsLoadingSource, /aria-live="polite"/);
  assert.match(settingsLoadingSource, /<Spin size="large" \/>/);
  assert.match(settingsLoadingSource, /sr-only/);
  assert.match(settingsLoadingSource, /common\.loading/);
  assert.match(settingsLoadingSource, /business-settings__loading/);
  assert.match(settingsLoadingSource, /<h1>\{t\("admin\.settings\.title"\)\}<\/h1>/);
});

test("forbidden uses the modern auxiliary surface with safe copy and action", () => {
  assert.match(forbiddenSource, /<ForbiddenState \/>/);
  assert.match(forbiddenSource, /requireAuthUser/);
  assert.match(forbiddenStateSource, /<AuxiliaryState/);
  assert.match(forbiddenStateSource, /className="auxiliary-state-page"/);
  assert.match(forbiddenStateSource, /account\.forbiddenTitle/);
  assert.match(forbiddenStateSource, /account\.forbiddenText/);
  assert.match(forbiddenStateSource, /<Button type="default" size="large" href="\/account"/);
  assert.match(forbiddenStateSource, /account\.open/);
  assert.doesNotMatch(forbiddenSource + forbiddenStateSource, /className="empty"|PageHeader|type="primary"/);
  assert.doesNotMatch(forbiddenSource, /fleet\.view|trips\.view|historyAdmin/);
  const expected = {
    uk: ["Доступ заборонено", "У вас немає дозволу на перегляд цієї сторінки."],
    ru: ["Доступ запрещён", "У вас нет разрешения на просмотр этой страницы."],
    en: ["Access denied", "You don’t have permission to open this page."],
  } as const;
  for (const locale of ["uk", "ru", "en"] as const satisfies readonly AppLocale[]) {
    assert.equal(MESSAGES[locale]["account.forbiddenTitle"], expected[locale][0]);
    assert.equal(MESSAGES[locale]["account.forbiddenText"], expected[locale][1]);
  }
});

test("AuxiliaryState owns one bounded h1 surface with intrinsic actions", () => {
  const notFound = renderWithLocale(
    "en",
    <AuxiliaryState title="Page not found" description="Missing." action={<Button type="default" href="/">Return to fleet</Button>} />,
  );
  assert.equal((notFound.match(/<h1\b/g) ?? []).length, 1);
  assert.match(notFound, /auxiliary-state__surface/);
  assert.match(notFound, /<a[^>]*href="\/"[^>]*>/);
  const forbidden = renderWithLocale(
    "en",
    <AuxiliaryState title="Access denied" description="No entry." action={<Button type="default" href="/account">Open account</Button>} />,
  );
  assert.equal((forbidden.match(/<h1\b/g) ?? []).length, 1);
  assert.match(forbidden, /<a[^>]*href="\/account"[^>]*>/);
  for (const html of [notFound, forbidden]) assert.doesNotMatch(html, /Taxi GPS|Таксопарк/);
  assert.match(auxiliarySource, /import \{ Card \} from "antd"/);
  assert.match(auxiliarySource, /<Card className="auxiliary-state__surface" variant="outlined"/);
  assert.doesNotMatch(auxiliarySource, /PageHeader|auth|router|reset|useI18n|href=/i);
  assert.match(componentStyles, /\.auxiliary-state \{[^}]*max-width: 552px/);
  assert.match(componentStyles, /\.auxiliary-state__body \{ padding: var\(--space-8\); \}/);
  assert.match(componentStyles, /\.auxiliary-state__title \{[^}]*font-size: 30px/);
  assert.match(componentStyles, /\.auxiliary-state__description \{[^}]*margin: 10px 0 0/);
  const descriptionRule = componentStyles.match(/\.auxiliary-state__description \{[^}]*\}/)?.[0] ?? "";
  assert.doesNotMatch(descriptionRule, /max-width|white-space|\bwidth:/);
  assert.match(componentStyles, /\.auxiliary-state__action \{[^}]*margin-top: var\(--space-6\)/);
  assert.match(componentStyles, /\.auxiliary-state__action > \* \{[^}]*flex: none;[^}]*width: auto;/);
  for (const source of [notFoundSource, errorSource, forbiddenStateSource]) {
    assert.match(source, /size="large"/);
    assert.doesNotMatch(source, /\bblock\b|fullWidth/);
  }
  assert.match(componentStyles, /@media \(max-width: 767px\)[^\n]*auxiliary-state__body \{ padding: var\(--space-6\); \}[^\n]*auxiliary-state__title \{ font-size: 25px; \}/);
});

test("auxiliary surfaces add no auth, proxy, or session behavior", () => {
  for (const [name, source] of [
    ["not-found", notFoundSource],
    ["error", errorSource],
    ["admin-not-found", adminNotFoundSource],
  ] as const) {
    assert.doesNotMatch(source, /resolveAuthUser|requireAuthUser|authenticatedApiFetch|taxi_session|cookies\(\)/, name);
  }
  assert.doesNotMatch(errorSource, /<Link /);
});
