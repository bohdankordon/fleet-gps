import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { activePositionHistoryPath, positionHistoryNavigationFor } from "./position-history-navigation";

const exact = "2026-08-11T02:00:00.123+03:00";

test("history route navigation preserves the exact checkpoint and keeps retention canonical", () => {
  const admin = positionHistoryNavigationFor(exact, true, "en");
  assert.equal(admin[0]?.href, "/admin/history");
  assert.equal(admin[1]?.href, "/admin/history/population?to=2026-08-11T02%3A00%3A00.123%2B03%3A00");
  assert.equal(admin[2]?.href, "/admin/history/retention");
  assert.deepEqual(positionHistoryNavigationFor(exact, false, "en").map((item) => item.label), ["Overview", "Population & Runs"]);
  assert.equal(activePositionHistoryPath("/admin/history/retention"), "/admin/history/retention");
});

test("the current operational overview carries no historical checkpoint in its navigation", () => {
  for (const locale of ["ru", "uk", "en"] as const) {
    for (const anchor of [null, exact] as const) assert.equal(positionHistoryNavigationFor(anchor, true, locale)[0]?.href, "/admin/history");
  }
  const navigation = readFileSync("src/lib/position-history-navigation.ts", "utf8");
  assert.doesNotMatch(navigation, /withAnchor\("\/admin\/history", anchor\)/);
  assert.match(navigation, /withAnchor\("\/admin\/history\/population", anchor\)/);
});

test("transitional routes enforce their established product permissions", () => {
  const population = readFileSync("src/app/admin/history/population/page.tsx", "utf8");
  const retention = readFileSync("src/app/admin/history/retention/page.tsx", "utf8");
  const proxy = readFileSync("src/proxy.ts", "utf8");
  assert.match(population, /historyAdmin\.view/);
  assert.match(population, /hasPermission\(user, "historyAdmin\.populate"\)/);
  assert.match(retention, /user\.role !== "ADMIN"/);
  assert.match(proxy, /path === "\/admin\/history\/population"/);
  assert.match(proxy, /ADMIN_ONLY_ROUTE_PREFIXES[\s\S]*"\/admin\/history\/retention"/);
});

test("all supported locales provide the three accepted destination labels", () => {
  assert.deepEqual(positionHistoryNavigationFor(null, true, "ru").map((item) => item.label), ["Обзор", "Заполнение и запуски", "Хранение"]);
  assert.deepEqual(positionHistoryNavigationFor(null, true, "uk").map((item) => item.label), ["Огляд", "Заповнення та запуски", "Зберігання"]);
  assert.deepEqual(positionHistoryNavigationFor(null, true, "en").map((item) => item.label), ["Overview", "Population & Runs", "Retention"]);
});

test("accepted History routes share the compact GPS History page identity without changing inner operations", () => {
  const overview = readFileSync("src/components/position-history-overview.tsx", "utf8");
  const population = readFileSync("src/components/position-history-population-workspace.tsx", "utf8");
  const retention = readFileSync("src/app/admin/history/retention/page.tsx", "utf8");
  assert.match(overview, /CompactPageHeading title=\{t\("history\.title"\)\} subtitle=\{t\("history\.overview\.description"\)\}/);
  assert.match(population, /CompactPageHeading title=\{t\("history\.title"\)\} subtitle=\{t\("history\.population\.workspaceDescription"\)\}/);
  assert.match(retention, /CompactPageHeading title=\{t\("history\.title"\)\} subtitle=\{t\("history\.retention\.workspaceDescription"\)\}/);
  for (const source of [overview, population, retention]) assert.doesNotMatch(source, /className="hero admin-history-hero"/);
  assert.match(population, /PositionHistoryPopulationWorkspace/);
  assert.match(retention, /PositionHistoryRetention/);
  assert.doesNotMatch(retention, /PositionHistoryCheckpointControl/);
});
