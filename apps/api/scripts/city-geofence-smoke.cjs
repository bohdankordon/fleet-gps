const assert = require("node:assert/strict");
const { NestFactory } = require("@nestjs/core");
const { loadRootEnv } = require("./load-root-env.cjs");

function assertDiagnosticState(diagnostic, beforeSettings) {
  const expectedConfigured = !beforeSettings.geofenceIsNull;
  assert.equal(diagnostic.configured, expectedConfigured);
  assert.equal(diagnostic.classificationAvailable, expectedConfigured);
  assert.equal(diagnostic.boundaryPolicy, "CITY");
}

async function main() {
  let app; let healthStatus = 0; let geofenceStatus = 0; let diagnostic = {}; let databaseWrites = "unknown"; let externalRequests = 0; let schedulerStarted = false; let closed = false;
  let insideClassification = "UNAVAILABLE"; let insideZone = "UNKNOWN"; let outsideClassification = "UNAVAILABLE"; let outsideZone = "UNKNOWN"; let boundaryClassification = "UNAVAILABLE"; let boundaryZone = "UNKNOWN"; let unconfiguredClassification = "UNAVAILABLE"; let unconfiguredZone = "UNKNOWN";
  const nativeFetch = globalThis.fetch;
  const keys = ["SYNC_SCHEDULER_ENABLED", "EQUGPS_BASE_URL", "EQUGPS_WEB_BASE_URL"];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    loadRootEnv(); process.env.SYNC_SCHEDULER_ENABLED = "false"; process.env.EQUGPS_BASE_URL = "https://official.city-geofence.invalid/api"; process.env.EQUGPS_WEB_BASE_URL = "https://web.city-geofence.invalid";
    globalThis.fetch = async (input, init) => { const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url; if (!url.startsWith("http://127.0.0.1:")) { externalRequests += 1; throw new Error("Unexpected external request."); } return nativeFetch(input, init); };
    const { AppModule } = require("../dist/app.module");
    const { DatabaseService } = require("../dist/modules/database/database.service");
    const { SyncSchedulerStatusService } = require("../dist/modules/sync-scheduler/sync-scheduler-status.service");
    const { classifyPointInPolygon } = require("../dist/modules/city-geofence/city-geofence.geometry");
    const { classifySpeedLimitZone } = require("../dist/modules/city-geofence/city-geofence.policy");
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false }); app.setGlobalPrefix("api"); await app.listen(0, "127.0.0.1");
    const database = app.get(DatabaseService).getClient();
    const fingerprint = async () => {
      const settings = await database.applicationSettings.findUnique({ where: { id: 1 }, select: { updatedAt: true, cityGeofenceGeoJson: true } });
      if (settings === null) throw new Error("Settings fingerprint unavailable.");
      return Object.freeze({ updatedAt: settings.updatedAt.toISOString(), geofenceIsNull: settings.cityGeofenceGeoJson === null });
    };
    const beforeSettings = await fingerprint();
    const port = app.getHttpServer().address().port;
    const health = await fetch(`http://127.0.0.1:${port}/api/health`); const geofence = await fetch(`http://127.0.0.1:${port}/api/system/city-geofence`);
    healthStatus = health.status; geofenceStatus = geofence.status; diagnostic = await geofence.json();
    schedulerStarted = app.get(SyncSchedulerStatusService).snapshot({ enabled: false, fleetIntervalSeconds: 60, runsIntervalSeconds: 300 }, new Date()).startedAt !== null;
    const fixture = { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] };
    insideClassification = classifyPointInPolygon(fixture, { longitude: 5, latitude: 5 }); insideZone = classifySpeedLimitZone(insideClassification);
    outsideClassification = classifyPointInPolygon(fixture, { longitude: 11, latitude: 5 }); outsideZone = classifySpeedLimitZone(outsideClassification);
    boundaryClassification = classifyPointInPolygon(fixture, { longitude: 0, latitude: 5 }); boundaryZone = classifySpeedLimitZone(boundaryClassification);
    unconfiguredClassification = classifyPointInPolygon(null, { longitude: 5, latitude: 5 }); unconfiguredZone = classifySpeedLimitZone(unconfiguredClassification);
    const afterSettings = await fingerprint();
    databaseWrites = beforeSettings.updatedAt === afterSettings.updatedAt && beforeSettings.geofenceIsNull === afterSettings.geofenceIsNull ? 0 : 1;
    assert.equal(healthStatus, 200); assert.equal(geofenceStatus, 200); assertDiagnosticState(diagnostic, beforeSettings);
    assert.equal(insideClassification, "INSIDE"); assert.equal(insideZone, "CITY"); assert.equal(outsideClassification, "OUTSIDE"); assert.equal(outsideZone, "OUTSIDE_CITY"); assert.equal(boundaryClassification, "BOUNDARY"); assert.equal(boundaryZone, "CITY"); assert.equal(unconfiguredClassification, "UNCONFIGURED"); assert.equal(unconfiguredZone, "UNKNOWN");
    assert.equal(databaseWrites, 0); assert.equal(externalRequests, 0); assert.equal(schedulerStarted, false);
  } catch { console.log("errorType: unknown"); process.exitCode = 1; }
  finally {
    if (app !== undefined) { try { await app.close(); closed = true; } catch { process.exitCode = 1; } }
    globalThis.fetch = nativeFetch; for (const [key, value] of previous) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    console.log(`health status: ${healthStatus}`); console.log(`city geofence status: ${geofenceStatus}`); console.log(`configured: ${diagnostic.configured ?? false}`); console.log(`classification available: ${diagnostic.classificationAvailable ?? false}`); console.log(`boundary policy: ${diagnostic.boundaryPolicy ?? "CITY"}`);
    console.log(`inside classification: ${insideClassification}`); console.log(`inside zone: ${insideZone}`); console.log(`outside classification: ${outsideClassification}`); console.log(`outside zone: ${outsideZone}`); console.log(`boundary classification: ${boundaryClassification}`); console.log(`boundary zone: ${boundaryZone}`); console.log(`unconfigured classification: ${unconfiguredClassification}`); console.log(`unconfigured zone: ${unconfiguredZone}`); console.log(`database writes: ${databaseWrites}`); console.log(`external requests: ${externalRequests}`); console.log(`application closed: ${closed}`);
  }
}

if (require.main === module) void main().catch(() => { console.log("errorType: unknown"); process.exitCode = 1; });

module.exports = { assertDiagnosticState };
