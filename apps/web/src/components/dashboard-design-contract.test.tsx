import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync("src/components/dashboard-client.tsx", "utf8");
const fleetOverviewModel = readFileSync("src/components/fleet-overview-model.ts", "utf8");
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

test("Fleet scheduler is collapsed by default, expands for degraded status, and retains all diagnostics without repeating generated time", () => {
  for (const component of ["Collapse", "Badge", "Alert", "Button", "Descriptions", "Grid", "Row", "Col"]) assert.match(scheduler, new RegExp(`\\b${component}\\b`));
  assert.match(scheduler, /fetch\("\/api\/system\/sync-status", \{ cache: "no-store", signal: abort\.signal \}\)/);
  assert.match(scheduler, /controller\.current\?\.abort\(\)/);
  assert.match(scheduler, /useState<string\[\]>\(initialStatus \? \[\] : \["details"\]\)/);
  assert.match(scheduler, /setActiveKeys\(\["details"\]\)/);
  assert.match(scheduler, /extra: refreshAction/);
  assert.match(scheduler, /aria-label=\{t\("scheduler\.refresh"\)\}/);
  assert.doesNotMatch(scheduler, /scheduler\.generated\)\}: \{formatSchedulerTimestamp\(status\.generatedAt/);
  for (const label of ["scheduler.started", "scheduler.fleetInterval", "scheduler.distanceInterval", "scheduler.generated", "scheduler.lastAttempt", "scheduler.lastSuccess", "scheduler.lastFailure", "scheduler.failureCategory", "scheduler.consecutiveFailures", "scheduler.successfulRuns", "scheduler.failedRuns", "scheduler.skippedOverlaps"]) assert.ok(scheduler.includes(`t("${label}")`), label);
  assert.match(scheduler, /schedulerStateLabel\(status, locale\)/);
});

test("Fleet keeps one compact toolbar group, local sort, and every current KPI metric", () => {
  for (const control of ["Input.Search", "<Select", "<Checkbox", "type=\"primary\""]) assert.ok(dashboard.includes(control), control);
  assert.match(dashboard, /className="fleet-toolbar" gap="small" wrap="wrap" align="center"/);
  assert.match(dashboard, /aria-label=\{t\("dashboard\.filters\.status"\)\}/);
  assert.match(dashboard, /popupMatchSelectWidth=\{230\}/);
  assert.match(dashboard, /sortFleetVehicles\(data\.vehicles, sort, locale\)/);
  assert.match(fleetOverviewModel, /export type FleetSort = "name" \| "freshness" \| "speed"/);
  assert.match(fleetOverviewModel, /Sorting is intentionally local: filtering and authorization remain server-owned/);
  assert.match(dashboard, /<Card size="small"><Row gutter=\{\[24, 16\]\}>/);
  for (const group of ["dashboard.summary.connection", "dashboard.summary.gps", "dashboard.summary.distance"]) assert.ok(dashboard.includes(`t("${group}")`), group);
  for (const metric of ["dashboard.summary.total", "dashboard.summary.online", "dashboard.summary.offline", "dashboard.summary.fresh", "dashboard.summary.stale", "dashboard.summary.unknown", "dashboard.summary.missing", "dashboard.summary.belowMinimum", "dashboard.summary.withoutDistance"]) assert.ok(dashboard.includes(`t("${metric}")`), metric);
  assert.match(dashboard, /vehicle\.dailyDistanceSource === null && vehicle\.dailyDistanceQuality === null/);
  assert.doesNotMatch(dashboard, /dashboard\.eyebrow/);
});

test("Fleet-specific CSS remains a minimal layout layer without Ant Design internals", () => {
  assert.ok(styles.split("\n").filter(Boolean).length <= 4);
  assert.doesNotMatch(styles, /\.ant-/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}/i);
});
