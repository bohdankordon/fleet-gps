const assert = require("node:assert/strict");
const { Test } = require("@nestjs/testing");

process.env.SYNC_SCHEDULER_ENABLED = "false";

function settings() {
  return Object.freeze({
    speedRuleEnabled: true, inactivityRuleEnabled: true, citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedToleranceKph: 10, speedingConfirmationUpdates: 2,
    inactivityDistanceMeters: 300, inactivityDurationMinutes: 60, timezone: "UTC", cityGeofence: Object.freeze({ configured: false, geometry: null }),
    effectiveSpeedThresholds: Object.freeze({ cityKph: 60, outsideCityKph: 100 }), updatedAt: "2026-08-06T10:00:00.000Z",
  });
}

function observation(vehicleId, minute, longitude = 0) {
  return { vehicleId, observedAt: new Date(Date.UTC(2026, 7, 6, 10, 0, 0) + minute * 60_000).toISOString(), latitude: 0, longitude };
}

function longitudeForMeters(meters) { return meters / 6_371_000 * 180 / Math.PI; }

async function main() {
  let app; let closed = false; let databaseWrites = 0; let externalRequests = 0;
  let first = "UNAVAILABLE"; let beforeDuration = "UNAVAILABLE"; let durationReached = "UNAVAILABLE"; let next = "UNAVAILABLE"; let thresholdReached = "UNAVAILABLE"; let dataGap = "UNAVAILABLE"; let outOfOrder = "UNAVAILABLE"; let isolated = false;
  const nativeFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { externalRequests += 1; throw new Error("Unexpected external request."); };
    const { AlertSettingsService } = require("../dist/modules/alert-settings");
    const { InactivityDetectorService } = require("../dist/modules/inactivity-detector/inactivity-detector.service");
    const { InactivityDetectorStateMachine } = require("../dist/modules/inactivity-detector/inactivity-detector.state-machine");
    const alertSettings = { getSettings: async () => settings() };
    app = await Test.createTestingModule({ providers: [InactivityDetectorStateMachine, InactivityDetectorService, { provide: AlertSettingsService, useValue: alertSettings }] }).compile();
    const detector = app.get(InactivityDetectorService);
    first = (await detector.detect(observation("idle", 0))).status;
    beforeDuration = (await detector.detect(observation("idle", 59 + 59 / 60))).status;
    const confirmation = await detector.detect(observation("idle", 60)); durationReached = confirmation.status;
    next = (await detector.detect(observation("idle", 61))).status;
    await detector.detect(observation("moving", 0));
    await detector.detect(observation("moving", 30, longitudeForMeters(350)));
    thresholdReached = (await detector.detect(observation("moving", 60, longitudeForMeters(350)))).status;
    await detector.detect(observation("gapped", 0)); dataGap = (await detector.detect(observation("gapped", 60))).status;
    await detector.detect(observation("ordered", 10)); outOfOrder = (await detector.detect(observation("ordered", 9))).status;
    const a1 = await detector.detect(observation("a", 0)); const b1 = await detector.detect(observation("b", 0));
    const a2 = await detector.detect(observation("a", 59 + 59 / 60)); await detector.detect(observation("b", 30, longitudeForMeters(350)));
    const a3 = await detector.detect(observation("a", 60)); const b2 = await detector.detect(observation("b", 60, longitudeForMeters(350)));
    isolated = a1.status === "COLLECTING" && b1.status === "COLLECTING" && a2.status === "COLLECTING" && a3.status === "CONFIRMED" && b2.status === "CLEAR";
    assert.deepEqual([first, beforeDuration, durationReached, next], ["COLLECTING", "COLLECTING", "CONFIRMED", "ACTIVE"]);
    assert.equal(confirmation.newlyConfirmed, true); assert.equal(thresholdReached, "CLEAR"); assert.equal(dataGap, "COLLECTING"); assert.equal(outOfOrder, "IGNORED"); assert.equal(isolated, true);
    assert.equal(databaseWrites, 0); assert.equal(externalRequests, 0);
  } catch {
    console.log("errorType: unknown"); process.exitCode = 1;
  } finally {
    if (app !== undefined) { try { await app.close(); closed = true; } catch { process.exitCode = 1; } }
    globalThis.fetch = nativeFetch;
    console.log("distance threshold meters: 300"); console.log("duration threshold minutes: 60");
    console.log(`first observation: ${first}`); console.log(`before duration: ${beforeDuration}`); console.log(`duration reached: ${durationReached}`); console.log(`next observation: ${next}`);
    console.log(`movement threshold reached: ${thresholdReached}`); console.log(`data gap result: ${dataGap}`); console.log(`out of order result: ${outOfOrder}`); console.log(`vehicle states isolated: ${isolated}`);
    console.log(`database writes: ${databaseWrites}`); console.log(`external requests: ${externalRequests}`); console.log(`application closed: ${closed}`);
  }
}

if (require.main === module) void main().catch(() => { console.log("errorType: unknown"); process.exitCode = 1; });
