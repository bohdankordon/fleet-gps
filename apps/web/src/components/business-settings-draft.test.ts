import assert from "node:assert/strict";
import test from "node:test";
import {
  BUSINESS_SETTINGS_EDITABLE_FIELDS,
  BUSINESS_SETTINGS_FIELD_TO_SECTION,
  BUSINESS_SETTINGS_SECTIONS,
  businessSettingsSectionForField,
} from "../lib/admin-settings/business-settings-sections";
import {
  applyBusinessSettingsResolution,
  businessSettingsChangedFields,
  businessSettingsDraftFromPersisted,
  changedBusinessSettingsPayload,
  computeBusinessSettingsConflict,
  formatBusinessSettingsUpdatedAt,
  isBusinessSettingsFieldInvalid,
  rebaseBusinessSettingsDraft,
  validateBusinessSettingsDraft,
} from "../lib/admin-settings/business-settings-draft";
import { numericAdminSettingsBounds } from "./admin-settings-form-model";
import type { AdminSettings } from "../lib/admin-settings/admin-settings-contract";

const BASELINE: AdminSettings = {
  timezone: "Europe/Kyiv",
  minimumDailyDistanceMeters: 100,
  positionFreshnessSeconds: 60,
  speedRuleEnabled: true,
  citySpeedLimitKph: 50,
  outsideCitySpeedLimitKph: 90,
  speedToleranceKph: 10,
  speedingConfirmationUpdates: 2,
  inactivityRuleEnabled: true,
  inactivityDistanceMeters: 100,
  inactivityDurationMinutes: 30,
  tripMovementSpeedKph: 5,
  tripMovementConfirmationSeconds: 60,
  tripStopConfirmationSeconds: 300,
  tripDataGapSeconds: 300,
  cityGeofence: { configured: true, ringCount: 2, pointCount: 40 },
  updatedAt: "2026-09-10T12:00:00.000Z",
  revision: 7,
};

test("field inventory is exactly the 15 approved editable settings", () => {
  assert.equal(BUSINESS_SETTINGS_EDITABLE_FIELDS.length, 15);
  assert.deepEqual([...BUSINESS_SETTINGS_EDITABLE_FIELDS].sort(), [
    "citySpeedLimitKph", "inactivityDistanceMeters", "inactivityDurationMinutes", "inactivityRuleEnabled",
    "minimumDailyDistanceMeters", "outsideCitySpeedLimitKph", "positionFreshnessSeconds",
    "speedRuleEnabled", "speedToleranceKph", "speedingConfirmationUpdates",
    "timezone", "tripDataGapSeconds", "tripMovementConfirmationSeconds", "tripMovementSpeedKph", "tripStopConfirmationSeconds",
  ].sort());
  assert.equal((BUSINESS_SETTINGS_EDITABLE_FIELDS as readonly string[]).includes("cityGeofenceGeoJson"), false);
});

test("field to section mapping covers all 15 fields across exactly four sections", () => {
  assert.equal(BUSINESS_SETTINGS_SECTIONS.length, 4);
  assert.deepEqual(BUSINESS_SETTINGS_SECTIONS.map((section) => section.id), ["day", "speeding", "inactivity", "trips"]);
  const covered = BUSINESS_SETTINGS_SECTIONS.flatMap((section) => [...section.fields]);
  assert.equal(covered.length, 15);
  assert.equal(new Set(covered).size, 15);
  for (const field of BUSINESS_SETTINGS_EDITABLE_FIELDS) {
    assert.ok((covered as readonly string[]).includes(field), field);
    assert.equal(businessSettingsSectionForField(field), BUSINESS_SETTINGS_FIELD_TO_SECTION[field]);
  }
  assert.deepEqual([...BUSINESS_SETTINGS_SECTIONS[0]!.fields], ["timezone", "minimumDailyDistanceMeters", "positionFreshnessSeconds"]);
  assert.deepEqual([...BUSINESS_SETTINGS_SECTIONS[3]!.fields], ["tripMovementSpeedKph", "tripMovementConfirmationSeconds", "tripStopConfirmationSeconds", "tripDataGapSeconds"]);
});

test("global draft survives section switching and reverting to baseline clears dirty", () => {
  const draft = businessSettingsDraftFromPersisted(BASELINE);
  assert.equal(businessSettingsChangedFields(draft, BASELINE).length, 0);
  const edited = { ...draft, citySpeedLimitKph: 55, tripDataGapSeconds: 600 };
  assert.deepEqual(businessSettingsChangedFields(edited, BASELINE), ["citySpeedLimitKph", "tripDataGapSeconds"]);
  const reverted = { ...edited, citySpeedLimitKph: 50, tripDataGapSeconds: 300 };
  assert.equal(businessSettingsChangedFields(reverted, BASELINE).length, 0);
  assert.equal(("cityGeofence" in edited), false);
  assert.equal(("revision" in edited), false);
});

test("changed-fields PATCH sends revision plus only changed editable fields", () => {
  const draft = { ...businessSettingsDraftFromPersisted(BASELINE), citySpeedLimitKph: 55 };
  assert.deepEqual(changedBusinessSettingsPayload(draft, BASELINE), { revision: 7, citySpeedLimitKph: 55 });
  const untouched = businessSettingsDraftFromPersisted(BASELINE);
  assert.deepEqual(changedBusinessSettingsPayload(untouched, BASELINE), { revision: 7 });
  const payload = changedBusinessSettingsPayload({ ...untouched, speedRuleEnabled: false }, BASELINE);
  assert.equal("cityGeofenceGeoJson" in payload, false);
  assert.equal("cityGeofence" in payload, false);
  assert.equal("updatedAt" in payload, false);
});

test("validation collects every error without coercion; blank is invalid everywhere", () => {
  const draft = businessSettingsDraftFromPersisted(BASELINE);
  assert.deepEqual(validateBusinessSettingsDraft(draft), []);
  const broken = { ...draft, timezone: "Not/AZone", citySpeedLimitKph: 201 as number | "", tripDataGapSeconds: "" as number | "" };
  assert.deepEqual(validateBusinessSettingsDraft(broken), ["timezone", "citySpeedLimitKph", "tripDataGapSeconds"]);
  for (const field of BUSINESS_SETTINGS_EDITABLE_FIELDS) {
    if (field === "speedRuleEnabled" || field === "inactivityRuleEnabled") continue;
    assert.equal(isBusinessSettingsFieldInvalid({ ...draft, [field]: "" } as typeof draft, field), true, `blank:${field}`);
  }
});

test("explicit zero is valid only for the three approved fields", () => {
  const draft = businessSettingsDraftFromPersisted(BASELINE);
  assert.equal(isBusinessSettingsFieldInvalid({ ...draft, minimumDailyDistanceMeters: 0 }, "minimumDailyDistanceMeters"), false);
  assert.equal(isBusinessSettingsFieldInvalid({ ...draft, speedToleranceKph: 0 }, "speedToleranceKph"), false);
  assert.equal(isBusinessSettingsFieldInvalid({ ...draft, inactivityDistanceMeters: 0 }, "inactivityDistanceMeters"), false);
  assert.equal(isBusinessSettingsFieldInvalid({ ...draft, positionFreshnessSeconds: 0 }, "positionFreshnessSeconds"), true);
  assert.equal(isBusinessSettingsFieldInvalid({ ...draft, citySpeedLimitKph: 0 }, "citySpeedLimitKph"), true);
  assert.equal(isBusinessSettingsFieldInvalid({ ...draft, speedingConfirmationUpdates: 0 }, "speedingConfirmationUpdates"), true);
});

test("client bounds reuse the authoritative numeric bounds object", () => {
  assert.deepEqual(numericAdminSettingsBounds.minimumDailyDistanceMeters, [0, 10000000]);
  assert.deepEqual(numericAdminSettingsBounds.positionFreshnessSeconds, [1, 86400]);
  assert.deepEqual(numericAdminSettingsBounds.speedToleranceKph, [0, 50]);
  assert.deepEqual(numericAdminSettingsBounds.inactivityDistanceMeters, [0, 5000]);
  assert.deepEqual(numericAdminSettingsBounds.tripDataGapSeconds, [1, 604800]);
});

test("non-overlapping conflict rebases automatically and preserves user edits", () => {
  const draft = { ...businessSettingsDraftFromPersisted(BASELINE), citySpeedLimitKph: 55 };
  const latest: AdminSettings = { ...BASELINE, revision: 8, tripDataGapSeconds: 600 };
  const analysis = computeBusinessSettingsConflict(BASELINE, draft, latest);
  assert.deepEqual([...analysis.userChanged], ["citySpeedLimitKph"]);
  assert.deepEqual([...analysis.serverChanged], ["tripDataGapSeconds"]);
  assert.deepEqual([...analysis.overlap], []);
  const rebased = rebaseBusinessSettingsDraft(latest, draft, BASELINE);
  assert.equal(rebased.citySpeedLimitKph, 55);
  assert.equal(rebased.tripDataGapSeconds, 600);
  assert.equal(businessSettingsChangedFields(rebased, latest).length, 1);
});

test("overlapping conflict exposes only the shared fields and applies per-field choices without saving", () => {
  const draft = { ...businessSettingsDraftFromPersisted(BASELINE), citySpeedLimitKph: 55, tripDataGapSeconds: 900 };
  const latest: AdminSettings = { ...BASELINE, revision: 9, citySpeedLimitKph: 60, inactivityDurationMinutes: 45 };
  const analysis = computeBusinessSettingsConflict(BASELINE, draft, latest);
  assert.deepEqual([...analysis.overlap], ["citySpeedLimitKph"]);
  const resolved = applyBusinessSettingsResolution(latest, draft, BASELINE, { citySpeedLimitKph: "mine" });
  assert.equal(resolved.citySpeedLimitKph, 55);
  assert.equal(resolved.tripDataGapSeconds, 900);
  assert.equal(resolved.inactivityDurationMinutes, 45);
  const resolvedLatest = applyBusinessSettingsResolution(latest, draft, BASELINE, { citySpeedLimitKph: "latest" });
  assert.equal(resolvedLatest.citySpeedLimitKph, 60);
  assert.equal(resolvedLatest.tripDataGapSeconds, 900);
});

test("identical user and server values are not treated as overlap", () => {
  const draft = { ...businessSettingsDraftFromPersisted(BASELINE), citySpeedLimitKph: 60 };
  const latest: AdminSettings = { ...BASELINE, revision: 8, citySpeedLimitKph: 60 };
  assert.deepEqual([...computeBusinessSettingsConflict(BASELINE, draft, latest).overlap], []);
});

test("updatedAt formats in the persisted timezone and rejects unknown zones", () => {
  const kyiv = formatBusinessSettingsUpdatedAt("en-GB", "2026-09-10T12:00:00.000Z", "Europe/Kyiv");
  const utc = formatBusinessSettingsUpdatedAt("en-GB", "2026-09-10T12:00:00.000Z", "UTC");
  assert.ok(kyiv && utc && kyiv !== utc);
  assert.equal(formatBusinessSettingsUpdatedAt("en-GB", "2026-09-10T12:00:00.000Z", "Not/AZone"), null);
  assert.equal(formatBusinessSettingsUpdatedAt("en-GB", "not-a-date", "Europe/Kyiv"), null);
});
