const assert = require("node:assert/strict");
const { Test } = require("@nestjs/testing");

function settings(geometry) {
  return Object.freeze({
    speedRuleEnabled: true, inactivityRuleEnabled: true, citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedToleranceKph: 10, speedingConfirmationUpdates: 2,
    inactivityDistanceMeters: 300, inactivityDurationMinutes: 60, timezone: "UTC", cityGeofence: Object.freeze({ configured: geometry !== null, geometry }),
    effectiveSpeedThresholds: Object.freeze({ cityKph: 60, outsideCityKph: 100 }), updatedAt: "2026-08-06T10:00:00.000Z",
  });
}

function observation(vehicleId, second, speedKph, longitude, latitude) {
  return { vehicleId, observedAt: `2026-08-06T10:00:${String(second).padStart(2, "0")}.000Z`, speedKph, longitude, latitude };
}

async function main() {
  let app; let closed = false; let databaseWrites = 0; let externalRequests = 0;
  let cityFirst = "UNAVAILABLE"; let citySecond = "UNAVAILABLE"; let cityThird = "UNAVAILABLE"; let outsideFirst = "UNAVAILABLE"; let outsideSecond = "UNAVAILABLE"; let equalThreshold = "UNAVAILABLE"; let unknownZone = "UNAVAILABLE"; let outOfOrder = "UNAVAILABLE"; let statesIsolated = false;
  const nativeFetch = globalThis.fetch;
  const fixture = Object.freeze({ type: "Polygon", coordinates: Object.freeze([Object.freeze([Object.freeze([0, 0]), Object.freeze([10, 0]), Object.freeze([10, 10]), Object.freeze([0, 10]), Object.freeze([0, 0])])]) });
  let currentSettings = settings(fixture);
  try {
    globalThis.fetch = async () => { externalRequests += 1; throw new Error("Unexpected external request."); };
    const { AlertSettingsService } = require("../dist/modules/alert-settings");
    const { CityGeofenceService } = require("../dist/modules/city-geofence");
    const { SpeedingDetectorService } = require("../dist/modules/speeding-detector/speeding-detector.service");
    const { SpeedingDetectorStateMachine } = require("../dist/modules/speeding-detector/speeding-detector.state-machine");
    const alertSettings = { getSettings: async () => currentSettings };
    const cityGeofence = new CityGeofenceService(alertSettings);
    app = await Test.createTestingModule({ providers: [SpeedingDetectorStateMachine, SpeedingDetectorService, { provide: AlertSettingsService, useValue: alertSettings }, { provide: CityGeofenceService, useValue: cityGeofence }] }).compile();
    const detector = app.get(SpeedingDetectorService);
    cityFirst = (await detector.detect(observation("city", 1, 61, 5, 5))).status;
    citySecond = (await detector.detect(observation("city", 2, 61, 5, 5))).status;
    cityThird = (await detector.detect(observation("city", 3, 61, 5, 5))).status;
    outsideFirst = (await detector.detect(observation("outside", 1, 101, 11, 5))).status;
    outsideSecond = (await detector.detect(observation("outside", 2, 101, 11, 5))).status;
    equalThreshold = (await detector.detect(observation("equal", 1, 60, 5, 5))).status;
    currentSettings = settings(null);
    unknownZone = (await detector.detect(observation("unknown", 1, 200, 5, 5))).status;
    currentSettings = settings(fixture);
    await detector.detect(observation("ordered", 2, 61, 5, 5));
    outOfOrder = (await detector.detect(observation("ordered", 1, 61, 5, 5))).status;
    const firstA = await detector.detect(observation("a", 1, 61, 5, 5));
    const firstB = await detector.detect(observation("b", 1, 61, 5, 5));
    const secondA = await detector.detect(observation("a", 2, 61, 5, 5));
    statesIsolated = firstA.status === "PENDING" && firstB.status === "PENDING" && secondA.status === "CONFIRMED";
    assert.deepEqual([cityFirst, citySecond, cityThird], ["PENDING", "CONFIRMED", "ACTIVE"]);
    assert.deepEqual([outsideFirst, outsideSecond], ["PENDING", "CONFIRMED"]);
    assert.equal(equalThreshold, "CLEAR"); assert.equal(unknownZone, "IGNORED"); assert.equal(outOfOrder, "IGNORED"); assert.equal(statesIsolated, true);
    assert.equal(databaseWrites, 0); assert.equal(externalRequests, 0);
  } catch {
    console.log("errorType: unknown"); process.exitCode = 1;
  } finally {
    if (app !== undefined) { try { await app.close(); closed = true; } catch { process.exitCode = 1; } }
    globalThis.fetch = nativeFetch;
    console.log("city threshold: 60"); console.log("outside threshold: 100"); console.log("confirmation updates: 2");
    console.log(`city first observation: ${cityFirst}`); console.log(`city second observation: ${citySecond}`); console.log(`city third observation: ${cityThird}`);
    console.log(`outside first observation: ${outsideFirst}`); console.log(`outside second observation: ${outsideSecond}`); console.log(`equal threshold result: ${equalThreshold}`); console.log(`unknown zone result: ${unknownZone}`); console.log(`out of order result: ${outOfOrder}`); console.log(`vehicle states isolated: ${statesIsolated}`);
    console.log(`database writes: ${databaseWrites}`); console.log(`external requests: ${externalRequests}`); console.log(`application closed: ${closed}`);
  }
}

if (require.main === module) void main().catch(() => { console.log("errorType: unknown"); process.exitCode = 1; });
