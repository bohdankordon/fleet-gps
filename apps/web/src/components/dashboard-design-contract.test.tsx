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
});

test("dashboard scheduler adopts shared feedback and action contracts while retaining its refresh route", () => {
  for (const primitive of ["Alert", "Badge", "Button", "Card"]) assert.match(scheduler, new RegExp(`\\b${primitive}\\b`));
  assert.match(scheduler, /fetch\("\/api\/system\/sync-status", \{ cache: "no-store", signal: abort\.signal \}\)/);
  assert.match(scheduler, /controller\.current\?\.abort\(\)/);
  assert.match(styles, /\.dashboard-scheduler__grid/);
});
