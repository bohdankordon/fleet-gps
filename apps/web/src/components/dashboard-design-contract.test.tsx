import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync("src/components/dashboard-client.tsx", "utf8");
const fleetOverviewModel = readFileSync("src/components/fleet-overview-model.ts", "utf8");
const scheduler = readFileSync("src/components/scheduler-status.tsx", "utf8");
const styles = readFileSync("src/styles/dashboard.css", "utf8");
const messages = readFileSync("src/i18n/messages.ts", "utf8");

test("Fleet uses native Ant Design controls while preserving the dashboard request and URL contract", () => {
  for (const component of ["Table", "Listy", "Card", "Statistic", "Input", "Select", "Checkbox", "Button", "Alert", "Empty", "Grid"]) assert.match(dashboard, new RegExp(`\\b${component}\\b`));
  assert.match(dashboard, /<Input className="fleet-toolbar__search"/);
  assert.match(dashboard, /prefix=\{<SearchOutlined \/>\}/);
  assert.doesNotMatch(dashboard, /Input\.Search/);
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
  assert.match(scheduler, /styles=\{\{ header: \{ alignItems: "center" \}/);
  assert.doesNotMatch(scheduler, /scheduler\.generated\)\}: \{formatSchedulerTimestamp\(status\.generatedAt/);
  for (const label of ["scheduler.started", "scheduler.fleetInterval", "scheduler.distanceInterval", "scheduler.generated", "scheduler.lastAttempt", "scheduler.lastSuccess", "scheduler.lastFailure", "scheduler.failureCategory", "scheduler.consecutiveFailures", "scheduler.successfulRuns", "scheduler.failedRuns", "scheduler.skippedOverlaps"]) assert.ok(scheduler.includes(`t("${label}")`), label);
  assert.match(scheduler, /schedulerStateLabel\(status, locale\)/);
});

test("Fleet keeps the selected Panel 4 toolbar, local sort, and every current KPI metric", () => {
  for (const control of ["<Input", "<Select", "<Checkbox", "type=\"primary\""]) assert.ok(dashboard.includes(control), control);
  assert.equal((dashboard.match(/function FleetToolbar/g) ?? []).length, 1);
  assert.match(dashboard, /<Flex className="fleet-toolbar" vertical gap="small"/);
  assert.match(dashboard, /<div>\{search\}<\/div><Flex className="fleet-toolbar__zones" gap="middle" wrap="wrap" align="center">/);
  assert.match(dashboard, /<Space className="fleet-toolbar__zone" size="small" wrap><Text type="secondary">\{t\("dashboard\.toolbar\.filters"\)\}<\/Text>\{status\}\{activity\}\{disabled\}<\/Space>/);
  assert.match(dashboard, /<Space className="fleet-toolbar__zone fleet-toolbar__zone--view" size="small" wrap><Text type="secondary">\{t\("dashboard\.toolbar\.view"\)\}<\/Text>\{ordering\}\{refresh\}<\/Space>/);
  assert.match(dashboard, /const disabled = <Checkbox checked=\{query\.includeDisabled !== false\}/);
  assert.match(dashboard, />\{t\("dashboard\.filters\.showDisabled"\)\}<\/Checkbox>/);
  assert.match(dashboard, /loading=\{loading\} onClick=\{onRefresh\}>\{loading \? t\("common\.refreshing"\) : t\("common\.refresh"\)\}<\/Button>/);
  assert.match(dashboard, /ariaLabel=\{t\("dashboard\.filters\.status"\)\}/);
  assert.match(dashboard, /fleet-toolbar__select-sizer/);
  assert.match(dashboard, /popupMatchSelectWidth/);
  assert.doesNotMatch(dashboard, /ToolbarVariant|ToolbarLabSwitcher|toolbarVariant|<Segmented/);
  assert.match(dashboard, /sortFleetVehicles\(data\.vehicles, sort, locale\)/);
  assert.match(fleetOverviewModel, /export type FleetSort = "name" \| "freshness" \| "speed"/);
  assert.match(fleetOverviewModel, /Sorting is intentionally local: filtering and authorization remain server-owned/);
  assert.match(dashboard, /<Row gutter=\{\[16, 16\]\}>/);
  assert.match(dashboard, /className="fleet-summary-card"/);
  assert.match(dashboard, /title=\{t\("dashboard\.summary\.total"\)\}/);
  assert.match(dashboard, /title=\{title\}/);
  assert.match(dashboard, /justify="space-between"/);
  assert.match(dashboard, /\{metric\.label\}:/);
  for (const group of ["dashboard.summary.connection", "dashboard.summary.gps", "dashboard.summary.distance"]) assert.ok(dashboard.includes(`t("${group}")`), group);
  for (const metric of ["dashboard.summary.total", "dashboard.summary.online", "dashboard.summary.offline", "dashboard.summary.fresh", "dashboard.summary.stale", "dashboard.summary.unknown", "dashboard.summary.missing", "dashboard.summary.belowMinimum", "dashboard.summary.withoutDistance"]) assert.ok(dashboard.includes(`t("${metric}")`), metric);
  assert.match(dashboard, /vehicle\.dailyDistanceSource === null && vehicle\.dailyDistanceQuality === null/);
  assert.doesNotMatch(dashboard, /dashboard\.eyebrow/);
});

test("Fleet metadata owns punctuation and one fixed generated timestamp", () => {
  for (const key of ["serviceDate", "timezone", "vehicles", "generated"]) assert.doesNotMatch(messages, new RegExp(`dashboard\\.metadata\\.${key}": \\{[^\\n]*: "[^"]*:`));
  assert.match(dashboard, /function MetadataItem/);
  assert.match(dashboard, /\{label\}: <Text strong>/);
  assert.match(dashboard, /formatFleetServiceDate\(data\.serviceDate, locale\)/);
  assert.match(dashboard, /formatFleetMetadataTimestamp\(data\.generatedAt, data\.timezone, locale\)/);
  assert.equal((dashboard.match(/formatFleetMetadataTimestamp/g) ?? []).length, 2);
});

test("Scheduler details use three native Card groups with aligned Descriptions", () => {
  assert.match(scheduler, /import \{ Alert, Badge, Button, Card, Collapse/);
  assert.match(scheduler, /<Row gutter=\{\[16, 16\]\}>/);
  assert.match(scheduler, /<Card size="small" title=\{t\("scheduler\.overall"\)\}>/);
  assert.match(scheduler, /<Card size="small" title=\{title\} extra=\{<Badge/);
  assert.match(scheduler, /<Descriptions size="small" column=\{1\} colon/);
});

test("Fleet-specific CSS uses owned layout classes without Ant Design internals", () => {
  assert.match(styles, /fleet-toolbar__intrinsic-select/);
  assert.match(styles, /fleet-toolbar__zones \{ width: 100%; \}/);
  assert.doesNotMatch(styles, /fleet-toolbar-lab/);
  assert.doesNotMatch(styles, /\.ant-/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}/i);
});
