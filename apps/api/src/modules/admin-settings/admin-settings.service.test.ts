import assert from "node:assert/strict";
import test from "node:test";
import { buildUserActor } from "../audit";
import { AdminSettingsService } from "./admin-settings.service";
import { AdminSettingsError } from "./admin-settings.types";

const actor = buildUserActor("00000000-0000-4000-8000-000000000001", "admin");
function row(overrides: Record<string, unknown> = {}) { return { timezone: "Europe/Kyiv", minimumDailyDistanceMeters: 500, positionFreshnessSeconds: 300, speedRuleEnabled: true, citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedToleranceKph: 10, speedingConfirmationUpdates: 2, inactivityRuleEnabled: true, inactivityDistanceMeters: 300, inactivityDurationMinutes: 60, tripMovementSpeedKph: 5, tripMovementConfirmationSeconds: 60, tripStopConfirmationSeconds: 300, tripDataGapSeconds: 300, cityGeofenceGeoJson: null, updatedAt: new Date("2026-08-01T00:00:00Z"), revision: 1, ...overrides }; }
function subject(initial = row()) { let stored = initial; const audits: unknown[] = []; const resets: readonly string[][] = [];
  const tx = { applicationSettings: { findUnique: async () => stored, findUniqueOrThrow: async () => stored, updateMany: async ({ where, data }: any) => { if (where.revision !== stored.revision) return { count: 0 }; const geo = data.cityGeofenceGeoJson; stored = { ...stored, ...data, cityGeofenceGeoJson: geo && typeof geo === "object" && !("type" in geo) ? null : geo, revision: stored.revision + 1, updatedAt: new Date("2026-08-01T00:00:01Z") }; for (const [key, value] of Object.entries(data)) if (value && typeof value === "object" && "increment" in value) (stored as any)[key] = (stored as any)[key] - 1 + (value as any).increment; return { count: 1 }; } } };
  const database = { getClient: () => ({ applicationSettings: tx.applicationSettings, $transaction: async (callback: any) => callback(tx) }) };
  const audit = { append: async (_client: unknown, event: unknown) => { audits.push(event); return event; } };
  const notifier = { notify: (changes: ReadonlySet<string>) => (resets as string[][]).push([...changes].sort()) };
  return { service: new AdminSettingsService(database as never, audit as never, notifier as never), stored: () => stored, audits, resets };
}

test("partial settings update preserves omitted values, increments revision, audits changed fields, and resets only speed context", async () => {
  const setup = subject(); const result = await setup.service.update(actor, { revision: 1, citySpeedLimitKph: 55 });
  assert.equal(result.citySpeedLimitKph, 55); assert.equal(result.outsideCitySpeedLimitKph, 90); assert.equal(result.revision, 2); assert.deepEqual(setup.resets, [["speeding"]]);
  assert.equal(setup.audits.length, 1); assert.match(JSON.stringify(setup.audits[0]), /citySpeedLimitKph/); assert.doesNotMatch(JSON.stringify(setup.audits[0]), /telegramChatId|dailyReportMinuteOfDay/);
});

test("valid grouped settings including a Polygon update are atomic and reset both relevant contexts", async () => {
  const setup = subject(); const polygon = { type: "Polygon", coordinates: [[[28, 49], [29, 49], [29, 50], [28, 49]]] }; const result = await setup.service.update(actor, { revision: 1, inactivityDurationMinutes: 90, cityGeofenceGeoJson: polygon });
  assert.equal(result.inactivityDurationMinutes, 90); assert.equal(result.cityGeofence.configured, true); assert.deepEqual(setup.resets, [["inactivity", "speeding"]]);
});

test("trip/stop policy update is atomic, audited as changed fields, and never resets alert detector contexts", async () => {
  const setup = subject(); const result = await setup.service.update(actor, { revision: 1, tripMovementSpeedKph: 7, tripMovementConfirmationSeconds: 90, tripStopConfirmationSeconds: 240, tripDataGapSeconds: 180 });
  assert.deepEqual({ speed: result.tripMovementSpeedKph, movement: result.tripMovementConfirmationSeconds, stop: result.tripStopConfirmationSeconds, gap: result.tripDataGapSeconds, revision: result.revision }, { speed: 7, movement: 90, stop: 240, gap: 180, revision: 2 });
  assert.deepEqual(setup.resets, []); assert.equal(setup.audits.length, 1); const details = (setup.audits[0] as any).details.changes; assert.deepEqual(details, [{ field: "tripMovementSpeedKph", previous: 5, next: 7 }, { field: "tripMovementConfirmationSeconds", previous: 60, next: 90 }, { field: "tripStopConfirmationSeconds", previous: 300, next: 240 }, { field: "tripDataGapSeconds", previous: 300, next: 180 }]);
});

test("invalid merged input persists nothing, writes no audit, and does not reset detector contexts", async () => {
  const setup = subject(); await assert.rejects(setup.service.update(actor, { revision: 1, minimumDailyDistanceMeters: 600, speedToleranceKph: 51 }), (error: unknown) => error instanceof AdminSettingsError && error.code === "INVALID_INPUT");
  assert.equal(setup.stored().minimumDailyDistanceMeters, 500); assert.equal(setup.stored().revision, 1); assert.equal(setup.audits.length, 0); assert.deepEqual(setup.resets, []);
});

test("stale revision cannot overwrite an earlier update, audit it, or reset contexts", async () => {
  const setup = subject(); await setup.service.update(actor, { revision: 1, speedRuleEnabled: false }); await assert.rejects(setup.service.update(actor, { revision: 1, inactivityRuleEnabled: false }), (error: unknown) => error instanceof AdminSettingsError && error.code === "CONFLICT");
  assert.equal(setup.stored().speedRuleEnabled, false); assert.equal(setup.stored().inactivityRuleEnabled, true); assert.equal(setup.stored().revision, 2); assert.equal(setup.audits.length, 1); assert.deepEqual(setup.resets, [["speeding"]]);
});

test("non-detector settings leave detector contexts intact and canonical validators reject every invalid scalar and geofence integration", async () => {
  const setup = subject(); await setup.service.update(actor, { revision: 1, timezone: "UTC", positionFreshnessSeconds: 1, minimumDailyDistanceMeters: 0 }); assert.deepEqual(setup.resets, []);
  for (const patch of [{ revision: 2, timezone: "not/a-zone" }, { revision: 2, minimumDailyDistanceMeters: -1 }, { revision: 2, positionFreshnessSeconds: 0 }, { revision: 2, citySpeedLimitKph: 201 }, { revision: 2, outsideCitySpeedLimitKph: 0 }, { revision: 2, speedToleranceKph: 51 }, { revision: 2, speedingConfirmationUpdates: 0 }, { revision: 2, inactivityDistanceMeters: 5001 }, { revision: 2, inactivityDurationMinutes: 0 }, { revision: 2, tripMovementSpeedKph: 0 }, { revision: 2, tripMovementConfirmationSeconds: 604801 }, { revision: 2, tripStopConfirmationSeconds: 0 }, { revision: 2, tripDataGapSeconds: 1.5 }, { revision: 2, speedRuleEnabled: "yes" }, { revision: 2, inactivityRuleEnabled: "yes" }, { revision: 2, cityGeofenceGeoJson: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [2, 2]]] } }, { revision: 2, cityGeofenceGeoJson: { type: "Polygon", coordinates: [[[181, 0], [1, 0], [1, 1], [181, 0]]] } }]) await assert.rejects(setup.service.update(actor, patch), AdminSettingsError);
  assert.equal(setup.audits.length, 1); assert.equal(setup.stored().revision, 2);
});
