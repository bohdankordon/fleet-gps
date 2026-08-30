import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync("src/components/dashboard-client.tsx", "utf8");
const scheduler = readFileSync("src/components/scheduler-status.tsx", "utf8");
const styles = readFileSync("src/styles/dashboard.css", "utf8");

test("Fleet uses native Ant Design controls while preserving the dashboard request and URL contract", () => {
  for (const component of ["Table", "Listy", "Card", "Statistic", "Input", "Select", "Checkbox", "Button", "Alert", "Empty", "Grid"]) assert.match(dashboard, new RegExp(`\\b${component}\\b`));
  assert.match(dashboard, /Input\.Search/);
  assert.match(dashboard, /setTimeout\(\(\) => \{ void request\(query, "user"\); \}, 300\)/);
  assert.match(dashboard, /controller\.current\?\.abort\(\)/);
  assert.match(dashboard, /window\.history\.pushState/);
  assert.match(dashboard, /dashboardHistoryPath\(next\)/);
  assert.match(dashboard, /window\.addEventListener\("popstate"/);
  assert.match(dashboard, /request\(restored, "popstate"\)/);
  assert.match(dashboard, /cache: "no-store"/);
});

test("Fleet desktop table and mobile list preserve operational data without pagination or row selection", () => {
  assert.match(dashboard, /<Table<Vehicle>/);
  assert.match(dashboard, /rowKey="id"/);
  assert.match(dashboard, /pagination=\{false\}/);
  assert.doesNotMatch(dashboard, /rowSelection=/);
  assert.match(dashboard, /size="middle"/);
  assert.match(dashboard, /scroll=\{\{ x: 960 \}\}/);
  assert.match(dashboard, /Grid\.useBreakpoint\(\)/);
  assert.match(dashboard, /<FleetMobileList/);
  assert.match(dashboard, /<Listy<Vehicle>/);
  for (const value of ["dashboard.table.gps", "dashboard.mobile.speed", "dashboard.mobile.distance", "dashboard.table.sourceQuality", "dashboard.table.activity", "dashboard.emptyFleetTitle", "dashboard.emptyTitle"]) assert.ok(dashboard.includes(`t("${value}")`));
  assert.ok((dashboard.match(/href=\{`\/vehicles\/\$\{vehicle\.id\}`\}/g) ?? []).length >= 2);
});

test("Fleet scheduler remains factual, refreshable, and uses native Ant Design feedback", () => {
  for (const component of ["Card", "Badge", "Alert", "Button", "Descriptions", "Row", "Col"]) assert.match(scheduler, new RegExp(`\\b${component}\\b`));
  assert.match(scheduler, /fetch\("\/api\/system\/sync-status", \{ cache: "no-store", signal: abort\.signal \}\)/);
  assert.match(scheduler, /controller\.current\?\.abort\(\)/);
  for (const label of ["scheduler.started", "scheduler.fleetInterval", "scheduler.distanceInterval", "scheduler.generated", "scheduler.lastAttempt", "scheduler.lastSuccess", "scheduler.lastFailure", "scheduler.failureCategory", "scheduler.consecutiveFailures", "scheduler.successfulRuns", "scheduler.failedRuns", "scheduler.skippedOverlaps"]) assert.ok(scheduler.includes(`t("${label}")`), label);
  assert.match(scheduler, /schedulerStateLabel\(status, locale\)/);
});

test("Fleet-specific CSS remains a minimal layout layer without Ant Design internals", () => {
  assert.ok(styles.split("\n").filter(Boolean).length <= 4);
  assert.doesNotMatch(styles, /\.ant-/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}/i);
});
