import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { MESSAGE_CATALOG } from "../i18n/messages";

const workspace = readFileSync("src/components/business-settings-workspace.tsx", "utf8");
const fields = readFileSync("src/components/business-settings-fields.tsx", "utf8");
const conflictPanel = readFileSync("src/components/business-settings-conflict-panel.tsx", "utf8");
const draftLib = readFileSync("src/lib/admin-settings/business-settings-draft.ts", "utf8");
const sectionsLib = readFileSync("src/lib/admin-settings/business-settings-sections.ts", "utf8");
const page = readFileSync("src/app/admin/settings/page.tsx", "utf8");
const loading = readFileSync("src/app/admin/settings/loading.tsx", "utf8");
const css = readFileSync("src/styles/business-settings.css", "utf8");
const guard = readFileSync("src/components/business-settings-leave-guard.ts", "utf8");
const tabs = readFileSync("src/components/admin-navigation-tabs.tsx", "utf8");

test("page header is compact with persisted-timezone metadata and accepted navigation", () => {
  for (const expected of ["business-settings-page", "admin.settings.tagline", "admin.settings.revision", "admin.settings.updatedPrefix", "admin.settings.entireFleet", "<time dateTime={settings.updatedAt}>", "settings.timezone", "AdminNavigationTabs", "BusinessSettingsWorkspace"]) assert.ok(page.includes(expected), expected);
  assert.equal(page.includes("admin.settings.eyebrow"), false, "no redundant administration eyebrow");
  assert.equal(loading.includes("admin.settings.eyebrow"), false, "no redundant administration eyebrow while loading");
  assert.equal(page.match(/<time /g)?.length ?? 0, 1, "human-readable timestamp rendered once");
  assert.equal(page.includes("admin.settings.lastUpdated"), false, "no duplicated timestamp interpolation");
  assert.ok(page.indexOf("<AdminNavigationTabs") > page.indexOf("</header>"));
  assert.match(page, /user\.role !== "ADMIN"\) redirect\("\/forbidden"\)/);
  for (const banned of ["updated by", "policy status", "compliance", "health"]) assert.equal(page.toLowerCase().includes(banned), false, banned);
});

test("exactly four presentation sections share one global draft with a single visible editor", () => {
  for (const expected of ["businessSettingsDraftFromPersisted", "businessSettingsChangedFields", "activeSection", "setActiveSection", "baseline", "dirtyFields", "saving", "saveError", "conflict", "originalBaseline"]) assert.ok(workspace.includes(expected), expected);
  assert.equal((workspace.match(/activeSection === "/g) ?? []).length, 4);
  for (const forbidden of ["KPI", "dashboard", "hero"]) assert.equal(workspace.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
});

test("desktop rail and mobile selector share state with distinct labels", () => {
  for (const expected of ["business-settings__rail", "aria-current", "business-settings__rail-item--selected", "business-settings__selector", "admin.settings.sectionSelector"]) assert.ok(workspace.includes(expected), expected);
  const catalog = MESSAGE_CATALOG as Record<string, Record<string, string>>;
  assert.equal(catalog["admin.settings.sectionSelector"]!.en, "Settings section");
  assert.equal(catalog["navigation.adminSwitcherLabel"]!.en, "Administration section");
  assert.match(css, /\.business-settings__layout[^}]*grid-template-columns: 200px minmax\(0, 720px\)/);
  assert.match(css, /\.business-settings__editor[^}]*max-width: 760px/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /\.business-settings__rail[^}]*display: none/);
});

test("changed-fields PATCH carries revision and never owns geometry", () => {
  for (const expected of ["changedBusinessSettingsPayload(draft, baseline)", "revision", "method: \"PATCH\"", "/api/admin/settings", "parseAdminSettings(body)", "router.refresh()"]) assert.ok(workspace.includes(expected), expected);
  assert.ok(draftLib.includes("cityGeofenceGeoJson") === false || draftLib.includes("\"cityGeofenceGeoJson\" in payload, false"));
  assert.match(draftLib, /revision: baseline\.revision/);
  assert.doesNotMatch(workspace, /cityGeofenceGeoJson/);
});

test("day section uses a timezone input with IANA help and a shared desktop row", () => {
  for (const expected of ["BusinessTimezoneField", "minimumDailyDistanceMeters", "positionFreshnessSeconds", "admin.settings.timezoneHelp", "Europe/Kyiv", "business-settings__row"]) assert.ok((workspace + fields).includes(expected), expected);
  assert.doesNotMatch(fields, /Select/);
  assert.match(fields, /placeholder="Europe\/Kyiv"/);
});

test("speeding uses a switch with truthful disabled semantics and a single advanced disclosure", () => {
  for (const expected of ["BusinessRuleSwitch", "speedRuleEnabled", "admin.settings.enabled", "admin.settings.disabled", "citySpeedLimitKph", "outsideCitySpeedLimitKph", "speedToleranceKph", "speedingConfirmationUpdates", "Collapse", "advancedSummary", "business-settings__dependent--subdued", "admin.settings.inactiveContextSpeeding"]) assert.ok((workspace + fields).includes(expected), expected);
  assert.doesNotMatch(workspace, /clear.*value|setValue.*""|disabledDependent/i);
  assert.match(workspace, /speedingConfirmationUpdates"\) setAdvancedOpen\(true\)/);
});

test("city boundary context is read-only metadata without map or editor affordances", () => {
  for (const expected of ["admin.settings.cityBoundary", "cityGeofence.configured", "ringCount", "pointCount", "admin.settings.cityBoundaryMissing", "admin.settings.cityBoundaryMissingHelp"]) assert.ok(workspace.includes(expected), expected);
  for (const banned of ["maplibre", "<Map", "importGeoJson", "textarea", "coordinates", "drawPolygon"]) assert.equal(workspace.toLowerCase().includes(banned.toLowerCase()), false, banned);
});

test("inactivity and trips sections follow the approved field order without extra disclosures", () => {
  const tripsOrder = ["tripMovementSpeedKph", "tripMovementConfirmationSeconds", "tripStopConfirmationSeconds", "tripDataGapSeconds"];
  let lastIndex = -1;
  for (const field of tripsOrder) { const index = workspace.indexOf(field); assert.ok(index > lastIndex, field); lastIndex = index; }
  for (const expected of ["inactivityRuleEnabled", "inactivityDistanceMeters", "inactivityDurationMinutes", "admin.settings.tripsRecomputeNote"]) assert.ok(workspace.includes(expected), expected);
  assert.equal((workspace.match(/<Collapse/g) ?? []).length, 1);
  assert.doesNotMatch(workspace, /rewritten|rewrite/i);
});

test("standard Ant components carry units and accessible validation associations", () => {
  for (const expected of ["Form.Item", "InputNumber", "Switch", "Select", "Typography", "Collapse", "Alert", "Button", "Modal", "aria-invalid", "aria-describedby", "unitMeters", "unitKph", "unitSeconds", "unitMinutes", "unitUpdates"]) assert.ok(workspace + fields.includes(expected), expected);
  assert.doesNotMatch(css, /gradient|box-shadow:\s*0 [1-9]|\banimation\b/i);
});
