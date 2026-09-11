import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { adminNavigationFor } from "../lib/admin-navigation";

const source = readFileSync("src/components/admin-settings-form.tsx", "utf8");
const page = readFileSync("src/app/admin/settings/page.tsx", "utf8");
const loading = readFileSync("src/app/admin/settings/loading.tsx", "utf8");
const businessWorkspace = readFileSync("src/components/business-settings-workspace.tsx", "utf8");

test("settings page is ADMIN-only and the administration navigation never grants Settings to USER", () => {
  const admin = { id: "a", login: "admin", role: "ADMIN", permissions: [], mustChangePassword: false } as const;
  const user = { id: "u", login: "user", role: "USER", permissions: ["fleet.view"], mustChangePassword: false } as const;
  assert.equal(adminNavigationFor(admin, "en").some((item) => item.href === "/admin/settings"), true);
  assert.equal(adminNavigationFor(user, "en").some((item) => item.href === "/admin/settings"), false);
  assert.match(page, /user\.role !== "ADMIN"\) redirect\("\/forbidden"\)/);
  assert.match(page, /requireAuthUser\(\)/);
});

test("settings form renders only approved controls with explicit labels, units, guidance, and readonly geofence status", () => {
  for (const expected of ["admin.settings.timezone", "admin.settings.minimumDailyDistance", "admin.settings.positionFreshness", "admin.settings.citySpeedLimit", "admin.settings.outsideCitySpeedLimit", "admin.settings.speedTolerance", "admin.settings.speedConfirmations", "admin.settings.inactivityDistance", "admin.settings.inactivityDuration", "admin.settings.tripsStops", "admin.settings.tripMovementSpeed", "admin.settings.tripMovementConfirmation", "admin.settings.tripStopConfirmation", "admin.settings.tripDataGap", "admin.settings.tripsStopsGuidance", "admin.settings.unitMeters", "admin.settings.unitKph", "admin.settings.unitSeconds", "admin.settings.unitMinutes", "admin.settings.generalGuidance", "admin.settings.speedGuidance", "admin.settings.inactivityGuidance", "cityGeofence.configured", "admin.settings.geofenceReadonly"]) assert.ok(source.includes(expected), expected);
  for (const hidden of ["telegramChatId", "dailyReportMinuteOfDay", "provider", "scheduler", "retention", "textarea"]) assert.equal(source.includes(hidden), false, hidden);
  assert.match(source, /type="checkbox"/); assert.match(source, /htmlFor=/); assert.match(source, /role="alert"/); assert.match(source, /role="status"/); assert.match(source, /aria-busy=\{busy\}/);
  assert.match(loading, /role="status"/); assert.match(loading, /business-settings-header/);
  assert.ok(loading.includes("common.loading") || businessWorkspace.includes("common.loading"), "loading copy");
});

test("save interaction guards duplicates, keeps edits on errors/conflicts, and updates revision only from a valid response", () => {
  for (const expected of ["if (busy) return", "adminSettingsPatchPayload(value, settings.revision)", "response.status === 409", "admin.settings.conflict", "window.location.reload()", "parseAdminSettings(body)", "setSettings(updated)", "setSuccess(true)", "disabled={!dirty || busy}"]) assert.ok(source.includes(expected), expected);
  assert.ok(page.includes("BusinessSettingsWorkspace") && businessWorkspace.includes("admin.settings.loadError"), "unavailable state");
});
