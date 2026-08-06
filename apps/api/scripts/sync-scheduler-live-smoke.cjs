const { NestFactory } = require("@nestjs/core");
const { loadRootEnv } = require("./load-root-env.cjs");

class LiveSmokeError extends Error {
  constructor(errorType) {
    super(errorType);
    this.errorType = errorType;
  }
}

function isValidIso(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function assertScheduler(condition, errorType = "scheduler") {
  if (!condition) throw new LiveSmokeError(errorType);
}

function delay(milliseconds) {
  let handle;
  const promise = new Promise((resolve) => { handle = setTimeout(resolve, milliseconds); });
  handle.unref?.();
  return { promise, clear: () => clearTimeout(handle) };
}

function safeErrorType(error) {
  if (error instanceof LiveSmokeError) return error.errorType;
  if (error && error.name === "ApiConfigurationError") return "configuration";
  if (error && typeof error.name === "string" && error.name.startsWith("EquGps")) return "equgps";
  if (error && typeof error.name === "string" && error.name.startsWith("Prisma")) return "database";
  return "unknown";
}

function printSuccess(result) {
  console.log("live smoke authorized: true");
  console.log(`health status: ${result.healthStatus}`);
  console.log(`scheduler status: ${result.schedulerStatus}`);
  console.log(`scheduler enabled: ${result.status.enabled}`);
  console.log(`scheduler started: ${result.status.startedAt !== null}`);
  console.log(`fleet successful runs: ${result.status.fleet.successfulRuns}`);
  console.log(`fleet failed runs: ${result.status.fleet.failedRuns}`);
  console.log(`fleet skipped overlaps: ${result.status.fleet.skippedOverlaps}`);
  console.log(`runs successful runs: ${result.status.runs.successfulRuns}`);
  console.log(`runs failed runs: ${result.status.runs.failedRuns}`);
  console.log(`runs skipped overlaps: ${result.status.runs.skippedOverlaps}`);
  console.log(`dashboard status: ${result.dashboardStatus}`);
  console.log(`total vehicles: ${result.totalVehicles}`);
  console.log(`official eQuGPS requests: ${result.officialRequests}`);
  console.log(`web eQuGPS requests: ${result.webRequests}`);
  console.log(`total eQuGPS requests: ${result.officialRequests + result.webRequests}`);
  console.log(`unexpected external requests: ${result.unexpectedRequests}`);
  console.log(`application closed: ${result.closed}`);
}

async function readJson(response, errorType) {
  if (response.status !== 200) throw new LiveSmokeError(errorType);
  try { return await response.json(); }
  catch { throw new LiveSmokeError(errorType); }
}

async function main() {
  if (process.env.ALLOW_REAL_EQUGPS_REQUESTS !== "true" || process.env.ALLOW_DATABASE_WRITES !== "true") {
    console.log("live smoke authorized: false");
    console.log("errorType: authorization");
    process.exitCode = 1;
    return;
  }

  let app;
  let closeAttempted = false;
  let closed = false;
  let pollDelay;
  let result;
  let failure;
  const nativeFetch = globalThis.fetch;
  let officialRequests = 0;
  let webRequests = 0;
  let unexpectedRequests = 0;

  try {
    loadRootEnv();
    // These are process-only overrides. The production parser uses the two interval keys below.
    process.env.SYNC_SCHEDULER_ENABLED = "true";
    process.env.FLEET_SYNC_INTERVAL_SECONDS = "60";
    process.env.RUNS_SYNC_INTERVAL_SECONDS = "60";
    process.env.SYNC_SCHEDULER_SHUTDOWN_TIMEOUT_MS = "50000";

    const { parseApiConfig } = require("../dist/config/api-config");
    const config = parseApiConfig(process.env);
    const officialOrigin = new URL(config.equGps.officialBaseUrl).origin;
    const webOrigin = new URL(config.equGps.webBaseUrl).origin;
    let localOrigin;

    globalThis.fetch = async (input, init) => {
      let origin;
      try {
        const value = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        origin = new URL(value).origin;
      } catch {
        unexpectedRequests += 1;
        throw new LiveSmokeError("equgps");
      }

      if (origin === officialOrigin) officialRequests += 1;
      else if (origin === webOrigin) webRequests += 1;
      else if (origin !== localOrigin) {
        unexpectedRequests += 1;
        throw new LiveSmokeError("equgps");
      }
      return nativeFetch(input, init);
    };

    const { AppModule } = require("../dist/app.module");
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (!address || typeof address === "string" || !Number.isInteger(address.port)) throw new LiveSmokeError("api");
    localOrigin = `http://127.0.0.1:${address.port}`;

    const health = await globalThis.fetch(`${localOrigin}/api/health`);
    const healthBody = await readJson(health, "api");
    assertScheduler(healthBody && typeof healthBody === "object", "api");

    const initialResponse = await globalThis.fetch(`${localOrigin}/api/system/sync-status`);
    const initialStatus = await readJson(initialResponse, "api");
    assertScheduler(initialStatus.enabled === true);
    assertScheduler(isValidIso(initialStatus.startedAt));
    assertScheduler(initialStatus.fleetIntervalSeconds === 60);
    assertScheduler(initialStatus.runsIntervalSeconds === 60);
    for (const job of [initialStatus.fleet, initialStatus.runs]) {
      assertScheduler(job && job.running === false);
      assertScheduler(job.successfulRuns === 0 && job.failedRuns === 0);
      assertScheduler(job.consecutiveFailures === 0 && job.skippedOverlaps === 0);
    }

    const deadline = Date.parse(initialStatus.startedAt) + 110_000;
    let finalStatus;
    while (Date.now() <= deadline) {
      const response = await globalThis.fetch(`${localOrigin}/api/system/sync-status`);
      const status = await readJson(response, "api");
      const jobs = [status.fleet, status.runs];
      if (jobs.some((job) => job.failedRuns > 0 || job.lastFailureAt !== null || job.lastFailureCategory !== null)) throw new LiveSmokeError("scheduler");
      if (status.fleet.successfulRuns >= 1 && status.runs.successfulRuns >= 1 && !status.fleet.running && !status.runs.running) {
        finalStatus = status;
        break;
      }
      pollDelay = delay(1_000);
      await pollDelay.promise;
      pollDelay.clear();
      pollDelay = undefined;
    }
    assertScheduler(finalStatus !== undefined);

    assertScheduler(finalStatus.enabled === true);
    assertScheduler(isValidIso(finalStatus.startedAt));
    assertScheduler(finalStatus.runs.successfulRuns === 1);
    assertScheduler(finalStatus.fleet.successfulRuns >= 1 && finalStatus.fleet.successfulRuns <= 2);
    for (const job of [finalStatus.fleet, finalStatus.runs]) {
      assertScheduler(job.failedRuns === 0 && job.consecutiveFailures === 0 && job.skippedOverlaps === 0);
      assertScheduler(job.running === false && isValidIso(job.lastSuccessAt));
      assertScheduler(job.lastFailureAt === null && job.lastFailureCategory === null);
    }

    const requestsBeforeDashboard = officialRequests + webRequests;
    const dashboardResponse = await globalThis.fetch(`${localOrigin}/api/dashboard/vehicles`);
    const dashboard = await readJson(dashboardResponse, "api");
    const vehicles = Array.isArray(dashboard.vehicles) ? dashboard.vehicles : [];
    assertScheduler(dashboard.summary?.total === 58 && vehicles.length === 58 && dashboard.timezone === "Europe/Kyiv", "api");
    assertScheduler(officialRequests + webRequests === requestsBeforeDashboard, "api");
    assertScheduler(officialRequests > 0 && webRequests > 0 && unexpectedRequests === 0, "equgps");

    result = {
      healthStatus: health.status,
      schedulerStatus: initialResponse.status,
      dashboardStatus: dashboardResponse.status,
      totalVehicles: dashboard.summary.total,
      status: finalStatus,
      officialRequests,
      webRequests,
      unexpectedRequests,
      closed: false,
    };
  } catch (error) {
    failure = safeErrorType(error);
    process.exitCode = 1;
  } finally {
    if (pollDelay !== undefined) pollDelay.clear();
    if (app !== undefined && !closeAttempted) {
      closeAttempted = true;
      try { await app.close(); closed = true; }
      catch { failure = failure ?? "unknown"; process.exitCode = 1; }
    }
    globalThis.fetch = nativeFetch;
    if (result !== undefined && closed) {
      result.closed = true;
      printSuccess(result);
    } else {
      console.log("live smoke authorized: true");
      console.log(`errorType: ${failure ?? "unknown"}`);
    }
  }
}

void main().catch(() => { console.log("live smoke authorized: true"); console.log("errorType: unknown"); process.exitCode = 1; });
