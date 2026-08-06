const assert = require("node:assert/strict");
const { NestFactory } = require("@nestjs/core");
const { loadRootEnv } = require("./load-root-env.cjs");

function assertCityGeofenceContract(cityGeofence, validateGeoJsonPolygon) {
  assert.equal(typeof cityGeofence?.configured, "boolean");
  if (!cityGeofence.configured) {
    assert.equal(cityGeofence.geometry, null);
    return null;
  }
  const polygon = validateGeoJsonPolygon(cityGeofence.geometry);
  assert.notEqual(polygon, null);
  assert.equal(polygon.type, "Polygon");
  return polygon;
}

async function main() {
  let app;
  let healthStatus = 0;
  let settingsStatus = 0;
  let settings = {};
  let externalRequests = 0;
  let closed = false;
  const nativeFetch = globalThis.fetch;
  const keys = ["SYNC_SCHEDULER_ENABLED", "EQUGPS_BASE_URL", "EQUGPS_WEB_BASE_URL"];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    loadRootEnv();
    process.env.SYNC_SCHEDULER_ENABLED = "false";
    process.env.EQUGPS_BASE_URL = "https://official.alert-settings.invalid/api";
    process.env.EQUGPS_WEB_BASE_URL = "https://web.alert-settings.invalid";
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.startsWith("http://127.0.0.1:")) {
        externalRequests += 1;
        throw new Error("Unexpected external request.");
      }
      return nativeFetch(input, init);
    };
    const { AppModule } = require("../dist/app.module");
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const port = app.getHttpServer().address().port;
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    const alertSettings = await fetch(`http://127.0.0.1:${port}/api/system/alert-settings`);
    healthStatus = health.status;
    settingsStatus = alertSettings.status;
    settings = await alertSettings.json();
    assert.equal(healthStatus, 200);
    assert.equal(settingsStatus, 200);
    assert.equal(settings.speedRuleEnabled, true);
    assert.equal(settings.inactivityRuleEnabled, true);
    assert.equal(settings.citySpeedLimitKph, 50);
    assert.equal(settings.outsideCitySpeedLimitKph, 90);
    assert.equal(settings.speedToleranceKph, 10);
    assert.equal(settings.speedingConfirmationUpdates, 2);
    assert.equal(settings.inactivityDistanceMeters, 300);
    assert.equal(settings.inactivityDurationMinutes, 60);
    assert.equal(settings.timezone, "Europe/Kyiv");
    const { validateGeoJsonPolygon } = require("../dist/modules/alert-settings/alert-settings.validation");
    assertCityGeofenceContract(settings.cityGeofence, validateGeoJsonPolygon);
    assert.deepEqual(settings.effectiveSpeedThresholds, { cityKph: 60, outsideCityKph: 100 });
    assert.equal(Object.hasOwn(settings.effectiveSpeedThresholds, "outsideKph"), false);
    assert.equal(externalRequests, 0);
  } catch {
    console.log("errorType: unknown");
    process.exitCode = 1;
  } finally {
    if (app !== undefined) {
      try { await app.close(); closed = true; }
      catch { process.exitCode = 1; }
    }
    globalThis.fetch = nativeFetch;
    for (const [key, value] of previous) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    console.log(`health status: ${healthStatus}`);
    console.log(`alert settings status: ${settingsStatus}`);
    console.log(`speed rule enabled: ${settings.speedRuleEnabled ?? false}`);
    console.log(`inactivity rule enabled: ${settings.inactivityRuleEnabled ?? false}`);
    console.log(`city speed limit: ${settings.citySpeedLimitKph ?? 0}`);
    console.log(`outside city speed limit: ${settings.outsideCitySpeedLimitKph ?? 0}`);
    console.log(`speed tolerance: ${settings.speedToleranceKph ?? 0}`);
    console.log(`speed confirmation updates: ${settings.speedingConfirmationUpdates ?? 0}`);
    console.log(`inactivity distance meters: ${settings.inactivityDistanceMeters ?? 0}`);
    console.log(`inactivity duration minutes: ${settings.inactivityDurationMinutes ?? 0}`);
    console.log(`city threshold: ${settings.effectiveSpeedThresholds?.cityKph ?? 0}`);
    console.log(`outside threshold: ${settings.effectiveSpeedThresholds?.outsideCityKph ?? 0}`);
    console.log(`city geofence configured: ${settings.cityGeofence?.configured ?? false}`);
    console.log(`external requests: ${externalRequests}`);
    console.log(`application closed: ${closed}`);
  }
}

if (require.main === module) void main();

module.exports = { assertCityGeofenceContract };
