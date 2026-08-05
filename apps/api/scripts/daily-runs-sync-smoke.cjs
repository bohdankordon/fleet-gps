function safeFailure(error, EquGpsError) {
  if (error instanceof EquGpsError) {
    const classes = new Set(["EquGpsConfigurationError", "EquGpsUnauthorizedError", "EquGpsForbiddenError", "EquGpsRateLimitError", "EquGpsTimeoutError", "EquGpsNetworkError", "EquGpsResponseValidationError", "EquGpsHttpError"]);
    if (!classes.has(error.name)) return { errorType: "unknown" };
    return { errorType: error.name, operation: error.operation, status: error.status, diagnosticCode: error.diagnosticCode };
  }
  if (error && (error.name === "ApiConfigurationError" || error.name === "DailyRunsConfigurationError")) return { errorType: "configuration" };
  if (error && typeof error.name === "string" && error.name.startsWith("Prisma")) return { errorType: "database" };
  return { errorType: "unknown" };
}

function printFailure(failure) {
  console.log(`errorType: ${failure.errorType}`);
  if (failure.operation !== undefined) console.log(`operation: ${failure.operation}`);
  if (typeof failure.status === "number") console.log(`status: ${failure.status}`);
  if (failure.diagnosticCode !== undefined) console.log(`diagnosticCode: ${failure.diagnosticCode}`);
}

async function main() {
  let app;
  let result;
  let counts = { vehicles: 0, states: 0, dailyStats: 0, runs: 0, provisional: 0, settings: 0, serviceDates: 0 };
  let requests = 0;
  const externalDurations = [];
  let closed = true;
  let failure;
  let EquGpsError;
  const nativeFetch = global.fetch;
  require("./load-root-env.cjs").loadRootEnv();
  global.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const external = !url.startsWith("http://127.0.0.1:");
    const startedAt = Date.now();
    try { return await nativeFetch(input, init); }
    finally { if (external) { requests += 1; externalDurations.push(Date.now() - startedAt); } }
  };
  try {
    const { NestFactory } = require("@nestjs/core");
    const { AppModule } = require("../dist/app.module");
    const { DailyRunsSyncService } = require("../dist/modules/dashboard/daily-runs-sync.service");
    const { DatabaseService } = require("../dist/modules/database/database.service");
    ({ EquGpsError } = require("@taxi-gps/equgps"));
    app = await NestFactory.createApplicationContext(AppModule, { logger: false, abortOnError: false });
    closed = false;
    const service = app.get(DailyRunsSyncService);
    const database = app.get(DatabaseService);
    try { result = await service.syncCurrentDayRuns(); }
    catch (error) { failure = safeFailure(error, EquGpsError); process.exitCode = 1; }
    try {
      const prisma = database.getClient();
      counts.vehicles = await prisma.vehicle.count();
      counts.states = await prisma.vehicleCurrentState.count();
      counts.dailyStats = await prisma.dailyVehicleStat.count();
      counts.runs = await prisma.dailyVehicleStat.count({ where: { source: "RUNS" } });
      counts.provisional = await prisma.dailyVehicleStat.count({ where: { quality: "PROVISIONAL" } });
      counts.settings = await prisma.applicationSettings.count();
      if (result) counts.serviceDates = (await prisma.dailyVehicleStat.findMany({ where: { source: "RUNS", serviceDate: new Date(`${result.serviceDate}T00:00:00.000Z`) }, distinct: ["serviceDate"], select: { serviceDate: true } })).length;
    } catch (error) { if (!failure) { failure = safeFailure(error, EquGpsError); process.exitCode = 1; } }
    if (!failure && (counts.vehicles !== 58 || counts.states !== 58 || counts.dailyStats <= 0 || counts.settings !== 1 || counts.serviceDates !== 1 || (requests !== 2 && requests !== 4))) { failure = { errorType: "unknown" }; process.exitCode = 1; }
  } catch (error) {
    failure = failure ?? safeFailure(error, EquGpsError ?? class {});
    process.exitCode = 1;
  } finally {
    if (app) {
      try { await app.close(); closed = true; }
      catch { closed = false; failure = failure ?? { errorType: "unknown" }; process.exitCode = 1; }
    }
    global.fetch = nativeFetch;
    if (failure) printFailure(failure);
    console.log(`sync success: ${Boolean(result)}`);
    console.log(`runs received: ${result?.runsReceived ?? 0}`);
    console.log(`unique runs: ${result?.uniqueRuns ?? 0}`);
    console.log(`daily stats upserted: ${result?.dailyStatsUpserted ?? 0}`);
    console.log(`vehicles without run: ${result?.vehiclesWithoutRun ?? 0}`);
    console.log(`unmatched runs: ${result?.unmatchedRuns ?? 0}`);
    console.log(`duplicate runs: ${result?.duplicateRuns ?? 0}`);
    console.log(`protected exact stats: ${result?.protectedExactStats ?? 0}`);
    console.log(`vehicle count: ${counts.vehicles}`);
    console.log(`current state count: ${counts.states}`);
    console.log(`daily stat count: ${counts.dailyStats}`);
    console.log(`runs source count: ${counts.runs}`);
    console.log(`provisional quality count: ${counts.provisional}`);
    console.log(`settings count: ${counts.settings}`);
    console.log(`service date count: ${counts.serviceDates}`);
    console.log(`http requests: ${requests}`);
    if (externalDurations[0] !== undefined) console.log(`session duration ms: ${externalDurations[0]}`);
    if (externalDurations[1] !== undefined) console.log(`runs duration ms: ${externalDurations[1]}`);
    console.log(`application closed: ${closed}`);
  }
}

void main().catch(() => { console.log("errorType: unknown"); process.exitCode = 1; });
