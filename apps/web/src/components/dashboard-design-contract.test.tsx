import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync("src/components/dashboard-client.tsx", "utf8");
const scheduler = readFileSync("src/components/scheduler-status.tsx", "utf8");
const styles = readFileSync("src/styles/dashboard.css", "utf8");

test("dashboard composes the owned Fluent primitives without changing its request and URL contracts", () => {
  for (const primitive of ["PageHeader", "FormField", "Input", "NativeSelect", "Checkbox", "Button", "Alert", "LoadingStatus", "EmptyState", "Card", "Badge"]) assert.match(dashboard, new RegExp(`\\b${primitive}\\b`));
  assert.match(dashboard, /type="search"/);
  assert.match(dashboard, /setTimeout\(\(\) => \{ void request\(query, "user"\); \}, 300\)/);
  assert.match(dashboard, /controller\.current\?\.abort\(\)/);
  assert.match(dashboard, /window\.history\.pushState/);
  assert.match(dashboard, /dashboardHistoryPath\(next\)/);
  assert.match(dashboard, /window\.addEventListener\("popstate"/);
  assert.match(dashboard, /request\(restored, "popstate"\)/);
  assert.match(dashboard, /cache: "no-store"/);
});

test("dashboard data representations preserve native accessible structures and mobile parity", () => {
  assert.match(dashboard, /<caption className="sr-only">\{t\("dashboard\.table\.label"\)\}<\/caption>/);
  assert.equal((dashboard.match(/scope="col"/g) ?? []).length, 7);
  assert.ok((dashboard.match(/href=\{`\/vehicles\/\$\{vehicle\.id\}`\}/g) ?? []).length >= 2);
  assert.match(dashboard, /className="dashboard-mobile-card"/);
  for (const value of ["dashboard.table.gps", "dashboard.mobile.speed", "dashboard.mobile.distance", "dashboard.table.sourceQuality", "dashboard.table.activity"]) assert.ok(dashboard.includes(`t("${value}")`));
  assert.match(styles, /\.dashboard-table-container \{ display: none; \}/);
  assert.match(styles, /\.dashboard-mobile-list \{ display: grid/);
  assert.match(styles, /@media \(max-width: 767px\)/);
});

test("dashboard scheduler adopts shared feedback and action contracts while retaining its refresh route", () => {
  for (const primitive of ["Alert", "Badge", "Button", "Card"]) assert.match(scheduler, new RegExp(`\\b${primitive}\\b`));
  assert.match(scheduler, /fetch\("\/api\/system\/sync-status", \{ cache: "no-store", signal: abort\.signal \}\)/);
  assert.match(scheduler, /controller\.current\?\.abort\(\)/);
  assert.match(scheduler, /Card as="section" variant="subtle" className=\{`dashboard-scheduler/);
  assert.match(scheduler, /dashboard-scheduler__panel/);
  assert.match(styles, /\.dashboard-scheduler__grid/);
});

test("scheduler health overview preserves every factual field while prioritizing readable semantic diagnostics", () => {
  for (const label of ["scheduler.started", "scheduler.fleetInterval", "scheduler.distanceInterval", "scheduler.generated", "scheduler.lastAttempt", "scheduler.lastSuccess", "scheduler.lastFailure", "scheduler.failureCategory", "scheduler.consecutiveFailures", "scheduler.successfulRuns", "scheduler.failedRuns", "scheduler.skippedOverlaps"]) assert.ok(scheduler.includes(`t("${label}")`), label);
  for (const section of ["scheduler.overall", "scheduler.fleetJob", "scheduler.distanceJob"]) assert.ok(scheduler.includes(`t("${section}")`), section);
  assert.match(scheduler, /schedulerStateLabel\(status, locale\)/);
  assert.equal((scheduler.match(/t\("scheduler\.refresh"\)/g) ?? []).length, 1);
  assert.match(scheduler, /<dl className=\{\["dashboard-scheduler__metadata-group"/);
  assert.match(scheduler, /<dt>/);
  assert.match(scheduler, /<dd className="ui-tabular-nums">/);
  assert.match(scheduler, /function MetadataGroups/);
  assert.match(scheduler, /function MetadataGroup/);
  assert.match(scheduler, /<MetadataGroup counters>/);
  assert.ok((scheduler.match(/stacked/g) ?? []).length >= 5);
  assert.match(scheduler, /ClockIcon/);
  assert.match(scheduler, /FleetIcon/);
  assert.match(scheduler, /RouteIcon/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 1024px\)[\s\S]*dashboard-scheduler__grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(min-width: 768px\) and \(max-width: 1024px\)[\s\S]*dashboard-scheduler__panel:last-child \{ grid-column: span 2;/);
  assert.match(styles, /dashboard-scheduler__metadata-groups \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); gap: var\(--space-3\)/);
  assert.match(styles, /dashboard-scheduler__metadata-group--counters \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); column-gap: var\(--space-4\); row-gap: var\(--space-2\)/);
  assert.match(styles, /dashboard-scheduler__field--stacked \{ grid-template-columns: 1fr; gap: var\(--space-1\)/);
  assert.match(styles, /dashboard-scheduler__panel dd \{[^\n]*font-size: var\(--font-size-label\)/);
  assert.match(styles, /@media \(max-width: 767px\)[\s\S]*dashboard-scheduler__metadata-groups, .dashboard-scheduler__metadata-group, .dashboard-scheduler__metadata-group--counters \{ grid-template-columns: 1fr;/);
  assert.match(styles, /@media \(max-width: 767px\)[\s\S]*dashboard-scheduler__field \{ grid-template-columns: 1fr; gap: var\(--space-1\); \}/);
  assert.match(styles, /dashboard-scheduler__metadata-group--counters .dashboard-scheduler__field \{ grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.doesNotMatch(styles, /dashboard-scheduler[^\n]*min-height/);
});

test("dashboard visual hierarchy uses restrained semantic surfaces rather than page-local colors", () => {
  for (const tone of ["primary", "success", "danger", "info", "warning", "neutral"]) {
    assert.match(dashboard, new RegExp(`tone: "${tone}"`));
    assert.match(styles, new RegExp(`\\.dashboard-stat-card--${tone}`));
  }
  assert.match(dashboard, /status === "offline" \? "danger"/);
  assert.match(dashboard, /className="dashboard-page-header"/);
  assert.match(dashboard, /priority: "primary"/);
  assert.match(dashboard, /priority: "secondary"/);
  assert.match(dashboard, /dashboard-stat-card--\$\{priority\}-metric/);
  assert.match(styles, /\.dashboard-page-header[^\n]*color-brand-subtle/);
  assert.match(styles, /\.dashboard-filter-bar[^\n]*background: var\(--color-brand-subtle\)/);
  assert.match(styles, /\.dashboard-table-container th[^\n]*background: var\(--color-brand-subtle\)/);
  assert.match(styles, /\.dashboard-scheduler--active[^\n]*color-brand-subtle/);
  assert.match(styles, /\.dashboard-scheduler--danger[^\n]*color-danger-background/);
  assert.match(styles, /\.dashboard-scheduler__panel::before/);
  assert.doesNotMatch(styles, /dashboard-scheduler__panel \{[^\n]*border-inline-start/);
  assert.match(styles, /dashboard-stat-card--primary-metric strong/);
  assert.match(styles, /transition: background-color var\(--duration-fast\)/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}/i);
});
