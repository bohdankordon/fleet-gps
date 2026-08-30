import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync("src/components/dashboard-client.tsx", "utf8");
const fleetModel = readFileSync("src/components/fleet-overview-model.ts", "utf8");
const styles = readFileSync("src/styles/dashboard.css", "utf8");
const scheduler = readFileSync("src/components/scheduler-status.tsx", "utf8");

test("Fleet keeps its server-owned request, URL, refresh, and authorization boundaries", () => {
  for (const contract of ["controller.current?.abort()", "setTimeout(() => { void request(query, \"user\"); }, 300)", "window.history.pushState", "dashboardHistoryPath(next)", "request(restored, \"popstate\")", "cache: \"no-store\""]) assert.ok(dashboard.includes(contract), contract);
  assert.match(dashboard, /sortFleetVehicles\(data\.vehicles, sort, locale\)/);
  assert.match(fleetModel, /filtering and authorization remain server-owned/i);
  assert.doesNotMatch(dashboard, /positionFreshnessSeconds.*[<>]=|freshness.*seconds/i);
});

test("Fleet uses Base UI-backed shadcn controls and semantic desktop/mobile representations", () => {
  for (const primitive of ["Table", "TableHeader", "TableBody", "TableHead", "TableCell", "Badge", "Select", "Checkbox", "Input", "Skeleton", "Alert"]) assert.match(dashboard, new RegExp(`\\b${primitive}\\b`));
  assert.match(dashboard, /<TableCaption className="sr-only">\{t\("dashboard\.table\.label"\)\}<\/TableCaption>/);
  assert.equal((dashboard.match(/scope="col"/g) ?? []).length, 6);
  assert.ok((dashboard.match(/href=\{`\/vehicles\/\$\{vehicle\.id\}`\}/g) ?? []).length >= 3);
  assert.match(dashboard, /className="fleet-mobile-row"/);
  assert.match(styles, /\.fleet-table-shell \{ display: none; \}/);
  assert.match(styles, /\.fleet-mobile-list \{ display: grid/);
  assert.match(styles, /@media \(max-width: 767px\)/);
});

test("Fleet preserves separate connectivity, freshness, and provider-disabled language", () => {
  for (const component of ["ConnectionStatus", "FreshnessIndicator", "ProviderDisabled"]) assert.match(dashboard, new RegExp(`function ${component}`));
  assert.match(dashboard, /vehicle\.disabled \? <ProviderDisabled/);
  assert.match(dashboard, /freshnessLabel\(vehicle\.positionFreshness, locale\)/);
  assert.match(dashboard, /statusLabel\(vehicle\.status, locale\)/);
  assert.match(dashboard, /formatTimestamp\(vehicle\.fixTime, data\.timezone, locale\)/);
});

test("Fleet keeps the scheduler as an available compact diagnostic", () => {
  assert.match(dashboard, /<details className="fleet-service-status">/);
  assert.match(dashboard, /<SchedulerStatus initialStatus=\{schedulerStatus\}/);
  assert.match(styles, /\.fleet-service-status/);
  assert.match(scheduler, /fetch\("\/api\/system\/sync-status", \{ cache: "no-store", signal: abort\.signal \}\)/);
});

test("Fleet composes metadata, one toolbar, and the data surface without a summary card", () => {
  assert.match(dashboard, /<FleetHeader data=\{data\} schedulerStatus=\{initialSchedulerStatus\}/);
  assert.match(dashboard, /<FleetToolbar[\s\S]*query=\{query\}/);
  assert.doesNotMatch(dashboard, /<FleetSummary/);
  assert.doesNotMatch(styles, /\.fleet-summary/);
  assert.match(styles, /\.fleet-toolbar \{[\s\S]*border-top:[\s\S]*border-bottom:/);
});
