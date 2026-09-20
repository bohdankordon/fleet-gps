import "../test-setup-alias";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Module from "node:module";
import { ConfigProvider } from "antd";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/client";
import { createTranslator } from "../i18n/core";
import type { AppLocale } from "../i18n/locales";

const moduleHook = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => Record<string, unknown>;
};
const originalLoad = moduleHook._load.bind(Module);
moduleHook._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === "next/navigation") {
    return {
      useRouter: () => ({ replace: () => undefined, refresh: () => undefined, push: () => undefined }),
    };
  }
  return originalLoad(request, parent, isMain);
};

async function renderForm(mandatory: boolean, locale: AppLocale = "en"): Promise<string> {
  const { AccountSecurityForm } = await import("./account-security-form");
  function Harness() {
    return (
      <ConfigProvider>
        <I18nProvider locale={locale}>
          <AccountSecurityForm mandatory={mandatory} />
        </I18nProvider>
      </ConfigProvider>
    );
  }
  return renderToStaticMarkup(<Harness />);
}

test("mandatory form labels the current field as Temporary password", async () => {
  const html = await renderForm(true);
  assert.match(html, /Temporary password/);
  assert.doesNotMatch(html, /Current password/);
  assert.match(html, /New password/);
  assert.match(html, /Confirm new password/);
  assert.match(html, /Create password/);
  assert.doesNotMatch(html, /Change password/);
  assert.doesNotMatch(html, /Back to Account/);
});

test("normal form labels the current field as Current password with no back escape", async () => {
  const html = await renderForm(false);
  assert.match(html, /Current password/);
  assert.doesNotMatch(html, /Temporary password/);
  assert.match(html, /New password/);
  assert.match(html, /Confirm new password/);
  assert.match(html, /Change password/);
  assert.doesNotMatch(html, /Create password/);
  assert.doesNotMatch(html, /Back to Account/);
  assert.doesNotMatch(html, /href="\/account"/);
});

test("password-policy helper appears exactly once beneath New password", async () => {
  const helper = createTranslator("en")("auth.password.help");
  assert.ok(helper.includes("12"));
  for (const mandatory of [true, false] as const) {
    const html = await renderForm(mandatory);
    const occurrences = html.split(helper).length - 1;
    assert.equal(occurrences, 1, mandatory ? "mandatory helper once" : "normal helper once");
  }
  const source = readFileSync("src/components/account-security-form.tsx", "utf8");
  assert.equal((source.match(/auth\.password\.help/g) ?? []).length, 1);
});

test("temporary label is localized in UK, RU, and EN", async () => {
  const expected = {
    uk: "Тимчасовий пароль",
    ru: "Временный пароль",
    en: "Temporary password",
  } as const;
  for (const locale of ["uk", "ru", "en"] as const) {
    const html = await renderForm(true, locale);
    assert.ok(html.includes(expected[locale]), locale);
  }
  const normalUk = await renderForm(false, "uk");
  assert.ok(normalUk.includes("Поточний пароль"));
});

test("first-time establishment wording is localized while normal wording is unchanged", async () => {
  const createExpected = { uk: "Створити пароль", ru: "Создать пароль", en: "Create password" } as const;
  const changeExpected = { uk: "Змінити пароль", ru: "Изменить пароль", en: "Change password" } as const;
  for (const locale of ["uk", "ru", "en"] as const) {
    const forced = await renderForm(true, locale);
    assert.ok(forced.includes(createExpected[locale]), `${locale}: create`);
    const calm = await renderForm(false, locale);
    assert.ok(calm.includes(changeExpected[locale]), `${locale}: change`);
    assert.ok(!calm.includes(`>${createExpected[locale]}<`), `${locale}: normal keeps change language`);
  }
  const source = readFileSync("src/components/account-security-form.tsx", "utf8");
  assert.match(source, /t\(mandatory \? "auth\.password\.createTitle" : "auth\.password\.title"\)/);
});

test("success parses AuthUser, lands via contract, replaces, and refreshes the shell", async () => {
  const source = readFileSync("src/components/account-security-form.tsx", "utf8");
  assert.match(source, /parseAuthUser\(await response\.json\(\)\)/);
  assert.match(source, /router\.replace\(landingFor\(user\)\)/);
  assert.match(source, /router\.refresh\(\)/);
  assert.match(source, /setSucceeded\(true\)/);
  assert.match(source, /SUCCESS_NAVIGATION_DELAY_MS/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\.|URLSearchParams/);
});
