import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("Reports presents a localized period inside one grouped responsive control surface", () => {
  const report = source("src/components/fleet-activity-report-client.tsx");
  const css = source("src/app/globals.css");
  assert.match(report, /formatDateTime\(locale, initialRange\.from\)/);
  assert.match(report, /formatDateTime\(locale, initialRange\.to\)/);
  assert.match(report, /report-control-groups/);
  assert.match(report, /report-quick-ranges/);
  assert.match(report, /report-custom-date/);
  assert.match(report, /report-period/);
  assert.doesNotMatch(report, /from: initialRange\.from, to: initialRange\.to/);
  assert.match(css, /report-control-groups \{ display:grid; grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css, /report-custom-date \{ justify-self:end/);
  assert.match(css, /report-control-groups \{ grid-template-columns:1fr/);
});

test("selected Map vehicle details use the contextual Ant Design inspector with semantic primary and secondary navigation", () => {
  const map = source("src/components/fleet-map-client.tsx");
  const css = source("src/styles/map.css");
  assert.match(map, /function VehicleInspector/);
  assert.match(map, /<Descriptions className="map-inspector__descriptions"/);
  assert.match(map, /<Flex className="map-inspector__actions" vertical gap="small">/);
  assert.match(map, /<Button block type="primary" href=\{`\/vehicles\/\$\{vehicle\.vehicle\.id\}`\}/);
  assert.match(map, /<Button block type="default" href="\/events\?status=OPEN"/);
  assert.match(css, /map-workspace--selected/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) minmax\(300px, 340px\)/);
});

test("Audit controls use Kyiv datetime-local values and convert only at the filter boundary", () => {
  const viewer = source("src/components/audit-viewer.tsx");
  assert.equal((viewer.match(/type="datetime-local"/g) ?? []).length, 2);
  assert.match(viewer, /normalizeAuditLocalFilters/);
  assert.match(viewer, /track\.controls\.timezone/);
  assert.doesNotMatch(viewer, /placeholder="\d{4}-\d{2}-\d{2}T.*Z"/);
});

test("GPS History formats user-visible ranges while retaining exact instants for operations", () => {
  const files = ["position-history-status-view.tsx", "position-history-population.tsx", "position-history-durable-runs.tsx", "position-history-retention.tsx"];
  const history = files.map((file) => source(`src/components/${file}`)).join("\n");
  assert.match(history, /formatDateTime/);
  assert.match(history, /type="datetime-local"/);
  assert.match(history, /to: anchor/);
  assert.doesNotMatch(history, /<strong>\{data\.(?:from|to)\}<\/strong>|<td>\{slice\.(?:from|to)\}<\/td>|<strong>\{plan\.(?:canonicalAnchor|policyCutoff)\}<\/strong>/);
});

test("Fleet vehicle identities are semantic links to the existing detail route", () => {
  const dashboard = source("src/components/dashboard-client.tsx");
  assert.match(dashboard, /import Link from "next\/link"/);
  assert.match(dashboard, /function VehicleDetailLink[\s\S]*?href=\{`\/vehicles\/\$\{vehicle\.id\}`\}/);
  assert.equal((dashboard.match(/<VehicleIdentity vehicle=\{vehicle\}/g) ?? []).length, 2);
  assert.match(dashboard, /<Table<Vehicle>/);
});

test("Disable is destructive while Enable and password reset are not", () => {
  const detail = source("src/components/admin-user-detail.tsx");
  assert.match(detail, /variant="destructive"[\s\S]*lifecycle\("disable"\)/);
  assert.match(detail, /destructive loading=\{busy\}/);
  assert.doesNotMatch(detail, /variant="destructive"[\s\S]*lifecycle\("enable"\)/);
  assert.match(detail, /variant="secondary"[\s\S]*onConfirm=\{\(\) => void reset\(\)\}/);
});

test("accepted correction hooks cover users, permissions, account, dashboard summary semantics, and Trips spacing", () => {
  assert.match(source("src/app/admin/users/page.tsx"), /admin-users-hero/);
  const permissions = source("src/components/permission-selector.tsx");
  assert.match(permissions, /permission-copy/);
  assert.match(permissions, /permission-title/);
  assert.match(permissions, /permission-helper/);
  assert.match(source("src/app/account/page.tsx"), /account-heading/);
  const css = source("src/app/globals.css");
  for (const hook of ["trip-result-message", "danger-button", "grid-template-columns:16px minmax(0,1fr)", "input[type=\"checkbox\"]", "grid-template-rows:minmax(1.35em,auto) minmax(2.7em,auto)"]) assert.ok(css.includes(hook), hook);
  assert.match(source("src/components/dashboard-client.tsx"), /<Statistic/);
  assert.match(source("src/components/dashboard-client.tsx"), /<Table<Vehicle>/);
  const trips = source("src/components/vehicle-trips-client.tsx");
    assert.match(trips, /className="vehicle-trips__empty-surface"/);
  assert.match(trips, /<Empty image=\{Empty\.PRESENTED_IMAGE_SIMPLE\}/);
});
