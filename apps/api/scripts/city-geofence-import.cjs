const fs = require("node:fs");
const path = require("node:path");

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ENV_FILE_BYTES = 256 * 1024;
const MAX_ENV_FILE_PATH_CHARS = 1024;
const REPOSITORY_ROOT = path.resolve(__dirname, "../../..");

function usageError() { return new Error("invalid arguments"); }

function parseArguments(argv) {
  let file;
  let clear = false;
  let dryRun = false;
  let apply = false;
  let envFile;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--file") {
      if (file !== undefined || index + 1 >= argv.length || argv[index + 1].startsWith("--") || argv[index + 1].length === 0) throw usageError();
      file = argv[index + 1];
      index += 1;
    } else if (argument === "--env-file") {
      if (envFile !== undefined || index + 1 >= argv.length || argv[index + 1].startsWith("--") || argv[index + 1].length === 0) throw usageError();
      envFile = argv[index + 1];
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
  if (envFile !== undefined && dryRun) throw usageError();
  return Object.freeze({ file, clear, dryRun, apply, envFile });
}

function safeStats(polygon) {
  return Object.freeze({ ringCount: polygon.coordinates.length, positionCount: polygon.coordinates.reduce((count, ring) => count + ring.length, 0) });
}

function safeErrorType(error) {
  const name = error !== null && error !== undefined && typeof error.name === "string" ? error.name : "";
  if (/^[A-Za-z][A-Za-z0-9]*Error$/.test(name) && name.length <= 64) return name;
  return "unknown";
}

function classifyErrorType(stage, error) {
  if (stage === "input") return "input";
  if (stage === "environment") {
    const name = safeErrorType(error);
    if (name !== "unknown" && name !== "Error") return name;
    return "configuration";
  }
  if (stage === "application") {
    const name = safeErrorType(error);
    if (name !== "unknown" && name !== "Error") return name;
    return "application";
  }
  if (stage === "write") {
    const name = safeErrorType(error);
    if (name !== "unknown" && name !== "Error") return name;
    return "database";
  }
  if (stage === "shutdown") {
    const name = safeErrorType(error);
    if (name !== "unknown" && name !== "Error") return name;
    return "shutdown";
  }
  return "unknown";
}

function resolveEnvFilePath(supplied, fileSystem) {
  if (typeof supplied !== "string" || supplied.length === 0 || supplied.length > MAX_ENV_FILE_PATH_CHARS) throw new Error("invalid environment input");
  if (supplied.includes(String.fromCharCode(0))) throw new Error("invalid environment input");
  const resolved = path.resolve(REPOSITORY_ROOT, supplied);
  const rootWithSeparator = REPOSITORY_ROOT + path.sep;
  if (resolved === REPOSITORY_ROOT || !resolved.startsWith(rootWithSeparator)) throw new Error("invalid environment input");
  const activeFs = fileSystem !== undefined && fileSystem !== null ? fileSystem : fs;
  const metadata = activeFs.statSync(resolved);
  if (!metadata.isFile() || metadata.size > MAX_ENV_FILE_BYTES) throw new Error("invalid environment input");
  return resolved;
}

function defaultLoadEnvFile(absolutePath) {
  require("dotenv").config({ path: absolutePath, quiet: true, override: false });
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
    `error stage: ${state.errorStage}`,
    `error type: ${state.errorType}`,
  ];
}

async function run(argv, dependencies = {}) {
  const state = { mode: "dry-run", polygonValid: false, ringCount: 0, positionCount: 0, configured: false, databaseWritePerformed: false, applicationClosed: true, operationResult: "failed", errorStage: "none", errorType: "none" };
  const output = dependencies.output ?? ((line) => console.log(line));
  const fileSystem = dependencies.fs ?? fs;
  let app;
  const modifiedEnv = new Map();
  let currentStage = "input";
  let code = 1;
  try {
    const options = parseArguments(argv);
    state.mode = options.clear ? "clear" : options.apply ? "apply" : "dry-run";
    let polygon = null;
    if (!options.clear) {
      const filePath = path.resolve(REPOSITORY_ROOT, options.file);
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
      currentStage = "environment";
      const beforeEnv = Object.assign({}, process.env);
      const recordEnvDiff = () => {
        for (const key of Object.keys(process.env)) {
          if (!modifiedEnv.has(key) && beforeEnv[key] !== process.env[key]) modifiedEnv.set(key, beforeEnv[key]);
        }
        for (const key of Object.keys(beforeEnv)) {
          if (!modifiedEnv.has(key) && !(key in process.env)) modifiedEnv.set(key, beforeEnv[key]);
        }
      };
      if (options.envFile !== undefined) {
        const resolvedEnvFile = resolveEnvFilePath(options.envFile, fileSystem);
        const loadEnvFile = dependencies.loadEnvFile ?? defaultLoadEnvFile;
        loadEnvFile(resolvedEnvFile);
        recordEnvDiff();
      } else {
        const loadRootEnv = dependencies.loadRootEnv ?? require("./load-root-env.cjs").loadRootEnv;
        loadRootEnv();
        recordEnvDiff();
      }
      if (!modifiedEnv.has("SYNC_SCHEDULER_ENABLED")) modifiedEnv.set("SYNC_SCHEDULER_ENABLED", process.env.SYNC_SCHEDULER_ENABLED);
      process.env.SYNC_SCHEDULER_ENABLED = "false";
      currentStage = "application";
      const CityGeofenceModule = dependencies.CityGeofenceModule ?? require("../dist/modules/city-geofence/city-geofence.module").CityGeofenceModule;
      const ManagementService = dependencies.ManagementService ?? require("../dist/modules/city-geofence/city-geofence-management.service").CityGeofenceManagementService;
      if (dependencies.createApplicationContext !== undefined) {
        app = await dependencies.createApplicationContext(CityGeofenceModule, { logger: false, abortOnError: false });
      } else {
        const NestFactory = dependencies.NestFactory ?? require("@nestjs/core").NestFactory;
        app = await NestFactory.createApplicationContext(CityGeofenceModule, { logger: false, abortOnError: false });
      }
      const management = app.get(ManagementService);
      currentStage = "write";
      if (options.clear) await management.clearCityGeofence();
      else await management.replaceCityGeofence(polygon);
      state.databaseWritePerformed = true;
      state.configured = !options.clear;
    }
    state.operationResult = "succeeded";
    state.errorStage = "none";
    state.errorType = "none";
    code = 0;
  } catch (error) {
    state.errorStage = currentStage;
    state.errorType = classifyErrorType(currentStage, error);
    code = 1;
  } finally {
    if (app !== undefined) {
      try { await app.close(); }
      catch (closeError) {
        state.applicationClosed = false;
        if (code === 0) {
          state.errorStage = "shutdown";
          state.errorType = classifyErrorType("shutdown", closeError);
          state.operationResult = "failed";
          code = 1;
        }
      }
    }
    for (const entry of modifiedEnv) {
      const key = entry[0];
      const previous = entry[1];
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
    for (const line of createOutput(state)) output(line);
  }
  return code;
}

if (require.main === module) void run(process.argv.slice(2)).then((exitCode) => { process.exitCode = exitCode; });

module.exports = { MAX_ENV_FILE_BYTES, MAX_ENV_FILE_PATH_CHARS, MAX_FILE_BYTES, classifyErrorType, createOutput, defaultLoadEnvFile, parseArguments, resolveEnvFilePath, run, safeErrorType, safeStats };
