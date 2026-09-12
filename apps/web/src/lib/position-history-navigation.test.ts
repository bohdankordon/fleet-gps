import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { activePositionHistoryPath, positionHistoryNavigationFor } from "./position-history-navigation";

const exact = "2026-08-11T02:00:00.123+03:00";

test("history route navigation preserves the exact checkpoint and keeps retention canonical", () => {
  const admin = positionHistoryNavigationFor(exact, true, "en");
  assert.equal(admin[0]?.href, "/admin/history?to=2026-08-11T02%3A00%3A00.123%2B03%3A00");
  assert.equal(admin[1]?.href, "/admin/history/population?to=2026-08-11T02%3A00%3A00.123%2B03%3A00");
  assert.equal(admin[2]?.href, "/admin/history/retention");
  assert.deepEqual(positionHistoryNavigationFor(exact, false, "en").map((item) => item.label), ["Overview", "Population & Runs"]);
  assert.equal(activePositionHistoryPath("/admin/history/retention"), "/admin/history/retention");
});

test("transitional routes enforce their established product permissions", () => {
  const population = readFileSync("src/app/admin/history/population/page.tsx", "utf8");
  const retention = readFileSync("src/app/admin/history/retention/page.tsx", "utf8");
  const proxy = readFileSync("src/proxy.ts", "utf8");
  assert.match(population, /historyAdmin\.view/);
  assert.match(population, /hasPermission\(user, "historyAdmin\.populate"\)/);
  assert.match(retention, /user\.role !== "ADMIN"/);
  assert.match(proxy, /path === "\/admin\/history\/population"/);
  assert.match(proxy, /path === "\/admin\/history\/retention"/);
});

test("all supported locales provide the three accepted destination labels", () => {
  assert.deepEqual(positionHistoryNavigationFor(null, true, "ru").map((item) => item.label), ["Обзор", "Заполнение и запуски", "Хранение"]);
  assert.deepEqual(positionHistoryNavigationFor(null, true, "uk").map((item) => item.label), ["Огляд", "Заповнення та запуски", "Зберігання"]);
  assert.deepEqual(positionHistoryNavigationFor(null, true, "en").map((item) => item.label), ["Overview", "Population & Runs", "Retention"]);
});

test("transitional routes share the compact GPS History page identity without changing inner operations", () => {
  const population = readFileSync("src/components/position-history-status-view.tsx", "utf8");
  const retention = readFileSync("src/app/admin/history/retention/page.tsx", "utf8");
  assert.match(population, /CompactPageHeading title=\{t\("history\.title"\)\} subtitle=\{t\("history\.population\.workspaceDescription"\)\}/);
  assert.doesNotMatch(population, /className="hero admin-history-hero"/);
  assert.match(retention, /CompactPageHeading title=\{t\("history\.title"\)\} subtitle=\{t\("history\.retention\.workspaceDescription"\)\}/);
  assert.match(population, /PositionHistoryPopulation/);
  assert.match(population, /PositionHistoryDurableRuns/);
  assert.match(retention, /PositionHistoryRetention/);
});
