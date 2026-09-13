import "../test-setup-alias";
import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { ConfigProvider } from "antd";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/client";
import type { AppLocale } from "../i18n/locales";

const moduleHook = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => Record<string, unknown>;
};
const originalLoad = moduleHook._load.bind(Module);
moduleHook._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === "next/navigation") {
    return {
      useRouter: () => ({
        refresh: () => undefined,
        push: () => undefined,
        replace: () => undefined,
      }),
    };
  }
  return originalLoad(request, parent, isMain);
};

const source = readFileSync("src/components/vehicle-trips-unavailable.tsx", "utf8");
const styles = readFileSync("src/styles/vehicle-trips.css", "utf8");
const pageSource = readFileSync("src/app/vehicles/[vehicleId]/trips/page.tsx", "utf8");

async function render(locale: AppLocale = "en"): Promise<string> {
  const { VehicleTripsUnavailable } = await import("./vehicle-trips-unavailable");
  function Harness() {
    return (
      <ConfigProvider>
        <I18nProvider locale={locale}>
          <VehicleTripsUnavailable />
        </I18nProvider>
      </ConfigProvider>
    );
  }
  return renderToStaticMarkup(<Harness />);
}

test("unavailable copy matches the approved title and body in UK, RU, and EN", async () => {
  const expected = {
    uk: ["Поїздки тимчасово недоступні", "Не вдалося підготувати період для відображення поїздок.", "Повторити"],
    ru: ["Поездки временно недоступны", "Не удалось подготовить период для отображения поездок.", "Повторить"],
    en: ["Trips are temporarily unavailable", "We couldn’t prepare the period required to show trips.", "Retry"],
  } as const;
  for (const locale of ["uk", "ru", "en"] as const) {
    const html = await render(locale);
    for (const text of expected[locale]) assert.ok(html.includes(text), `${locale}: ${text}`);
  }
});

test("unavailable keeps one section heading without a second h1", async () => {
  const html = await render();
  assert.equal((html.match(/<h1\b/g) ?? []).length, 0);
  assert.equal((html.match(/<h2\b/g) ?? []).length, 1);
  assert.match(html, /aria-labelledby="vehicle-trips-unavailable-title"/);
  assert.match(html, /id="vehicle-trips-unavailable-title"/);
});

test("unavailable stays informational with no danger or dashboard language", async () => {
  const html = await render();
  assert.match(html, /ant-alert-info/);
  assert.doesNotMatch(html, /ant-alert-error|ant-alert-warning/);
  assert.match(html, /role="alert"/);
  assert.doesNotMatch(source, /type="error"|Result|Modal|KPI|dashboard/i);
  assert.doesNotMatch(source, /ErrorState/);
});

test("unavailable renders no workspace analytics, map, timeline, or No GPS data", async () => {
  const html = await render();
  for (const marker of [
    "vehicle-trips__period-bar",
    "vehicle-trips__summary",
    "vehicle-trips__timeline",
    "vehicle-trips__map",
    "No GPS data",
    "tripAnalysisPageQuery",
  ]) {
    assert.equal(html.includes(marker), false, marker);
  }
  assert.equal(html.includes("runtime settings"), false);
  assert.equal(html.includes("timezone"), false);
  assert.doesNotMatch(source, /No GPS data|noGpsTitle/);
});

test("retry refreshes the exact route with stable pending labels", async () => {
  const html = await render();
  assert.ok(html.includes("Retry"));
  assert.match(source, /startTransition\(\(\) => router\.refresh\(\)\)/);
  assert.match(source, /idleLabel=\{t\("common\.retry"\)\}/);
  assert.match(source, /loadingLabel=\{t\("common\.refreshing"\)\}/);
  assert.match(source, /loading=\{pending\}/);
  assert.match(source, /StableLoadingButton/);
  assert.doesNotMatch(source, /router\.(push|replace)/);
  assert.doesNotMatch(source, /URLSearchParams|tripAnalysisPageQuery|setTimeout|setInterval|poll/i);
});

test("unavailable stays compact and responsive without fixed desktop widths", () => {
  assert.match(styles, /\.vehicle-trips__unavailable \{[^}]*max-width: 760px;/);
  const ownRules = styles.match(/\.vehicle-trips__unavailable[^{]*\{[^}]*\}/g) ?? [];
  assert.ok(ownRules.length >= 2);
  for (const rule of ownRules) {
    assert.doesNotMatch(rule, /width: 100%|100dvh|100vh/);
    assert.doesNotMatch(rule, /\.ant-/);
  }
});

test("trips page keeps the shell for context-unavailable and the ready workspace intact", () => {
  const unavailableBranch = pageSource.slice(pageSource.indexOf('resolved.kind === "context-unavailable"'));
  assert.match(unavailableBranch, /<VehicleDetailShell[^>]*activeTab="trips"[^>]*>/);
  assert.match(unavailableBranch, /<VehicleTripsUnavailable \/>/);
  assert.match(unavailableBranch, /vehicleName=\{resolved\.vehicleName/);
  assert.match(pageSource, /vehicleName=\{resolved\.vehicleName \?\? t\("trips\.title"\)\}/);
  assert.match(pageSource, /initialPreset=\{resolved\.restoredFromUrl \? null : "TODAY"\}/);
  assert.match(pageSource, /initialOpenEnded=\{resolved\.openEnded\}/);
  assert.doesNotMatch(pageSource, /Unable to create initial trip-analysis range/);
});
