const fs = require("node:fs");
const path = require("node:path");

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function usageError() { return new Error("invalid arguments"); }

function parseArguments(argv) {
  let file;
  let clear = false;
  let dryRun = false;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--file") {
      if (file !== undefined || index + 1 >= argv.length || argv[index + 1].startsWith("--")) throw usageError();
      file = argv[index + 1];
      index += 1;
    } else if (argument === "--clear") {
      if (clear) throw usageError();
      clear = true;
    } else if (argument === "--dry-run") {
      if (dryRun) throw usageError();
      dryRun = true;
    } else if (argument === "--apply") {
      if (apply) throw usageError();
      apply = true;
    } else throw usageError();
  }
  if (dryRun === apply || (file !== undefined && clear) || (!file && !clear) || (clear && !apply)) throw usageError();
  return Object.freeze({ file, clear, dryRun, apply });
}

function safeStats(polygon) {
  return Object.freeze({ ringCount: polygon.coordinates.length, positionCount: polygon.coordinates.reduce((count, ring) => count + ring.length, 0) });
}

function createOutput(state) {
  return [
    `mode: ${state.mode}`,
    `polygon valid: ${state.polygonValid}`,
    `ring count: ${state.ringCount}`,
    `position count: ${state.positionCount}`,
    `geofence configured after operation: ${state.configured}`,
    `database write performed: ${state.databaseWritePerformed}`,
    `application closed: ${state.applicationClosed}`,
    `operation result: ${state.operationResult}`,
  ];
}

async function run(argv, dependencies = {}) {
  const state = { mode: "dry-run", polygonValid: false, ringCount: 0, positionCount: 0, configured: false, databaseWritePerformed: false, applicationClosed: true, operationResult: "failed" };
  const output = dependencies.output ?? ((line) => console.log(line));
  let app;
  let previousScheduler;
  let restoreScheduler = false;
  try {
    const options = parseArguments(argv);
    state.mode = options.clear ? "clear" : options.apply ? "apply" : "dry-run";
    let polygon = null;
    if (!options.clear) {
      const fileSystem = dependencies.fs ?? fs;
      const filePath = path.resolve(options.file);
      const metadata = fileSystem.statSync(filePath);
      if (!metadata.isFile() || metadata.size > MAX_FILE_BYTES) throw new Error("invalid polygon input");
      let input;
      try {
        const bytes = fileSystem.readFileSync(filePath);
        if (!Buffer.isBuffer(bytes) || bytes.length > MAX_FILE_BYTES) throw new Error("invalid polygon input");
        input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      }
      catch { throw new Error("invalid polygon input"); }
      const validatePolygon = dependencies.validatePolygon ?? require("../dist/modules/alert-settings/alert-settings.validation").validateGeoJsonPolygon;
      polygon = validatePolygon(input);
      if (polygon === null) throw new Error("invalid polygon input");
      state.polygonValid = true;
      Object.assign(state, safeStats(polygon));
    } else state.polygonValid = true;

    if (options.apply) {
      const loadRootEnv = dependencies.loadRootEnv ?? require("./load-root-env.cjs").loadRootEnv;
      previousScheduler = process.env.SYNC_SCHEDULER_ENABLED;
      restoreScheduler = true;
      loadRootEnv();
      process.env.SYNC_SCHEDULER_ENABLED = "false";
      const createApplicationContext = dependencies.createApplicationContext ?? require("@nestjs/core").NestFactory.createApplicationContext;
      const CityGeofenceModule = dependencies.CityGeofenceModule ?? require("../dist/modules/city-geofence/city-geofence.module").CityGeofenceModule;
      const ManagementService = dependencies.ManagementService ?? require("../dist/modules/city-geofence/city-geofence-management.service").CityGeofenceManagementService;
      app = await createApplicationContext(CityGeofenceModule, { logger: false, abortOnError: false });
      const management = app.get(ManagementService);
      if (options.clear) await management.clearCityGeofence();
      else await management.replaceCityGeofence(polygon);
      state.databaseWritePerformed = true;
      state.configured = !options.clear;
    }
    state.operationResult = "succeeded";
    return 0;
  } catch {
    return 1;
  } finally {
    if (app !== undefined) {
      try { await app.close(); }
      catch { state.applicationClosed = false; }
    }
    if (restoreScheduler) {
      if (previousScheduler === undefined) delete process.env.SYNC_SCHEDULER_ENABLED;
      else process.env.SYNC_SCHEDULER_ENABLED = previousScheduler;
    }
    for (const line of createOutput(state)) output(line);
  }
}

if (require.main === module) void run(process.argv.slice(2)).then((code) => { process.exitCode = code; });

module.exports = { MAX_FILE_BYTES, createOutput, parseArguments, run, safeStats };
