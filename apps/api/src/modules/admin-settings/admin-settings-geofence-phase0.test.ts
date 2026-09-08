import assert from "node:assert/strict";
import test from "node:test";
import { buildUserActor } from "../audit";
import { AdminSettingsService } from "./admin-settings.service";

const actor = buildUserActor("00000000-0000-4000-8000-000000000001", "admin");
function row(overrides: Record<string, unknown> = {}) { return { timezone: "Europe/Kyiv", minimumDailyDistanceMeters: 500, positionFreshnessSeconds: 300, speedRuleEnabled: true, citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedToleranceKph: 10, speedingConfirmationUpdates: 2, inactivityRuleEnabled: true, inactivityDistanceMeters: 300, inactivityDurationMinutes: 60, tripMovementSpeedKph: 5, tripMovementConfirmationSeconds: 60, tripStopConfirmationSeconds: 300, tripDataGapSeconds: 300, cityGeofenceGeoJson: null, updatedAt: new Date("2026-08-01T00:00:00Z"), revision: 1, ...overrides }; }
function subject(initial = row()) { let stored = initial; const audits: unknown[] = []; const resets: readonly string[][] = [];
  const tx = { applicationSettings: { findUnique: async () => stored, findUniqueOrThrow: async () => stored, updateMany: async ({ where, data }: any) => { if (where.revision !== stored.revision) return { count: 0 }; stored = { ...stored, ...data, revision: stored.revision + 1, updatedAt: new Date("2026-08-01T00:00:01Z") }; return { count: 1 }; } } };
  const database = { getClient: () => ({ applicationSettings: tx.applicationSettings, $transaction: async (callback: any) => callback(tx) }) };
  const audit = { append: async (_client: unknown, event: unknown) => { audits.push(event); return event; } };
  const notifier = { notify: (changes: ReadonlySet<string>) => (resets as string[][]).push([...changes].sort()) };
  return { service: new AdminSettingsService(database as never, audit as never, notifier as never), stored: () => stored, audits, resets };
}
const poly = (x: number) => ({ type: "Polygon", coordinates: [[[28, 49], [x, 49], [29, 50], [28, 50], [28, 49]]] });

// Phase0 geofence 7-8 are proven via public service behavior below (same-count change persists, identical is no-op).
// Direct internal helper export was removed to keep production surface minimal; public request-to-audit/reset coverage is authoritative.

test("Phase0 geofence 9-10: coordinate-only change persists with audit and reset, no raw coords in details", async () => {
  const setup = subject(row({ cityGeofenceGeoJson: poly(29) }));
  const result = await setup.service.update(actor, { revision: 1, cityGeofenceGeoJson: poly(29.0001) });
  assert.equal(result.cityGeofence.configured, true);
  assert.equal(result.revision, 2);
  assert.equal(setup.audits.length, 1);
  const changes = (setup.audits[0] as any).details.changes;
  assert.equal(changes.length, 1);
  assert.equal(changes[0].field, "cityGeofenceGeoJson");  assert.match(changes[0].previous, /1 rings, 5 points/);  assert.match(changes[0].next, /1 rings, 5 points/);
  assert.equal(JSON.stringify(changes[0]).includes("29.0001"), false);
  assert.deepEqual(setup.resets, [["speeding"]]);
});

test("Phase0 geofence C: coordinate plus scalar change both represented", async () => {
  const setup = subject(row({ cityGeofenceGeoJson: poly(29) }));
  const result = await setup.service.update(actor, { revision: 1, citySpeedLimitKph: 55, cityGeofenceGeoJson: poly(29.5) });
  assert.equal(result.citySpeedLimitKph, 55);
  const fields = ((setup.audits[0] as any).details.changes as any[]).map((c: any) => c.field).sort();
  assert.deepEqual(fields, ["cityGeofenceGeoJson", "citySpeedLimitKph"]);
});

test("Phase0 geofence identical update is no-op with no audit or reset", async () => {
  const setup = subject(row({ cityGeofenceGeoJson: poly(29) }));
  const result = await setup.service.update(actor, { revision: 1, cityGeofenceGeoJson: poly(29) });
  assert.equal(result.revision, 1);
  assert.equal(setup.audits.length, 0);
  assert.deepEqual(setup.resets, []);
});
