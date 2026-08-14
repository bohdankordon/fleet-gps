import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator, messagePlaceholders } from "./core";
import { I18nProvider, useI18n } from "./client";
import { formatDateTime, formatNumber, formatUnit } from "./formatting";
import { DEFAULT_LOCALE, DISPLAY_LOCALES, DISPLAY_TIMEZONE, NATIVE_LOCALE_NAMES, resolveLocale, resolveLocaleFromCookieHeader, SUPPORTED_LOCALES, type AppLocale } from "./locales";
import { MESSAGES } from "./messages";

test("locale catalog is exactly ru, uk, en with deterministic Russian fallback and no language detection", () => {
  assert.deepEqual([...SUPPORTED_LOCALES], ["ru", "uk", "en"]);
  assert.equal(DEFAULT_LOCALE, "ru");
  assert.equal(resolveLocale(undefined), "ru");
  assert.equal(resolveLocale("invalid"), "ru");
  for (const locale of SUPPORTED_LOCALES) {
    assert.equal(resolveLocale(locale), locale);
    assert.equal(resolveLocaleFromCookieHeader(`other=x; taxi_locale=${locale}; session=y`), locale);
  }
  assert.equal(resolveLocaleFromCookieHeader(null), "ru");
  assert.equal(resolveLocaleFromCookieHeader("taxi_locale=pl"), "ru");
  const source = `${readFileSync("src/i18n/locales.ts", "utf8")}\n${readFileSync("src/i18n/server.ts", "utf8")}`;
  assert.doesNotMatch(source, /accept-language|navigator\.language|preferredLanguages/i);
});

test("all dictionaries have identical keys and interpolation placeholder names", () => {
  const canonical = Object.keys(MESSAGES.ru).sort();
  assert.ok(canonical.length > 100);
  for (const locale of SUPPORTED_LOCALES) assert.deepEqual(Object.keys(MESSAGES[locale]).sort(), canonical);
  for (const key of canonical) {
    const expected = messagePlaceholders(MESSAGES.ru[key as keyof typeof MESSAGES.ru]);
    for (const locale of SUPPORTED_LOCALES) {
      const message = MESSAGES[locale][key as keyof typeof MESSAGES.ru];
      assert.deepEqual(messagePlaceholders(message), expected, `${locale}:${key}`);
      assert.doesNotMatch(message, /<\/?[A-Za-z][^>]*>/, `${locale}:${key}`);
    }
  }
  const sources = `${readFileSync("src/i18n/client.tsx", "utf8")}\n${readFileSync("src/i18n/core.ts", "utf8")}`;
  assert.doesNotMatch(sources, /dangerouslySetInnerHTML/);
});

function Probe() {
  const { locale, t } = useI18n();
  return <p data-locale={locale}>{t("auth.login.title")}</p>;
}

test("the client provider renders the same explicit locale and text supplied by the server", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const html = renderToStaticMarkup(<I18nProvider locale={locale}><Probe /></I18nProvider>);
    assert.ok(html.includes(`data-locale="${locale}"`));
    assert.ok(html.includes(createTranslator(locale)("auth.login.title")));
  }
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.match(layout, /<html lang=\{locale\}>/);
  assert.match(layout, /<I18nProvider locale=\{locale\}>/);
});

test("one absolute instant retains Europe/Kyiv semantics for every display locale", () => {
  const instant = "2026-08-05T12:34:56.000Z";
  assert.equal(DISPLAY_TIMEZONE, "Europe/Kyiv");
  assert.deepEqual(DISPLAY_LOCALES, { ru: "ru-UA", uk: "uk-UA", en: "en-GB" });
  for (const locale of SUPPORTED_LOCALES) {
    const expected = new Intl.DateTimeFormat(DISPLAY_LOCALES[locale], { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Kyiv" }).format(new Date(instant));
    assert.equal(formatDateTime(locale, instant), expected);
    assert.equal(new Date(instant).toISOString(), instant);
  }
});

test("numbers and genuine plural units are locale-aware without changing facts", () => {
  for (const locale of SUPPORTED_LOCALES) {
    assert.equal(formatNumber(locale, 1234.5), new Intl.NumberFormat(DISPLAY_LOCALES[locale]).format(1234.5));
    assert.match(formatUnit(locale, 1, "hour"), /^1\D/);
    assert.match(formatUnit(locale, 2, "hour"), /^2\D/);
    assert.match(formatUnit(locale, 5, "hour"), /^5\D/);
  }
  assert.notEqual(formatUnit("ru", 1, "hour"), formatUnit("ru", 2, "hour"));
  assert.notEqual(formatUnit("uk", 1, "day"), formatUnit("uk", 5, "day"));
  assert.notEqual(formatUnit("en", 1, "minute"), formatUnit("en", 2, "minute"));
});

test("native language names are invariant and the product has no localized route dimension", () => {
  assert.deepEqual(NATIVE_LOCALE_NAMES, { ru: "Русский", uk: "Українська", en: "English" });
  const selector = readFileSync("src/components/language-selector.tsx", "utf8");
  assert.match(selector, /NATIVE_LOCALE_NAMES\[value\]/);
  for (const locale of SUPPORTED_LOCALES) assert.doesNotMatch(selector, new RegExp(`router\\.(?:push|replace)\\([^)]+/${locale}`));
});

