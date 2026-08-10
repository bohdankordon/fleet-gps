function safeErrorType(error) {
  if (error && error.name === "ApiConfigurationError") return "configuration";
  if (error && typeof error.name === "string" && error.name.startsWith("EquGps")) return "equgps";
  if (error && typeof error.name === "string" && error.name.startsWith("Prisma")) return "database";
  return "unknown";
}

async function counts(prisma) {
  const [vehicles, currentStates, dailyStats, alertObservations, alertEvents, outbox, positionHistory, settings] = await Promise.all([
    prisma.vehicle.count(),
    prisma.vehicleCurrentState.count(),
    prisma.dailyVehicleStat.count(),
    prisma.alertEvaluationObservation.count(),
    prisma.alertEvent.count(),
    prisma.alertNotificationOutbox.count(),
    prisma.vehiclePositionObservation.count(),
    prisma.applicationSettings.count(),
  ]);
  return { vehicles, currentStates, dailyStats, alertObservations, alertEvents, outbox, positionHistory, settings };
}

function classifyRequest(value) {
  const url = new URL(value);
  if (url.pathname.endsWith("/api/devices/routes-new")) return "routesNew";
  if (url.hostname === "api.telegram.org") return "telegram";
  if (url.hostname.includes("openfreemap")) return "openFreeMap";
  if (url.pathname.endsWith("/devices") && url.search === "") return "devices";
  if (url.pathname.endsWith("/positions")) return url.search === "" ? "latestPositions" : "historicalPositions";
  return "unexpected";
}

async function main() {
  let app;
  let result;
  let before;
  let after;
  let prisma;
  let closed = true;
  const network = { devices: 0, latestPositions: 0, historicalPositions: 0, routesNew: 0, telegram: 0, openFreeMap: 0, unexpected: 0 };
  const nativeFetch = global.fetch;
  require("./load-root-env.cjs").loadRootEnv();
  global.fetch = async (input, init) => {
    const value = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const kind = classifyRequest(value);
    network[kind] += 1;
    if (kind !== "devices" && kind !== "latestPositions") throw new Error("Unexpected external request");
    return nativeFetch(input, init);
  };
  try {
    if (process.env.SYNC_SCHEDULER_ENABLED !== "false" || process.env.ALERT_INGESTION_ENABLED !== "false" || process.env.TELEGRAM_NOTIFICATIONS_ENABLED !== "false") throw new Error("controlled flags required");
    const { NestFactory } = require("@nestjs/core");
    const { AppModule } = require("../dist/app.module");
    const { FleetSyncService } = require("../dist/modules/fleet/fleet-sync.service");
    const { DatabaseService } = require("../dist/modules/database/database.service");
    app = await NestFactory.createApplicationContext(AppModule, { logger: false, abortOnError: false });
    closed = false;
    const fleet = app.get(FleetSyncService);
    const database = app.get(DatabaseService);
    prisma = database.getClient();
    before = await counts(prisma);
    result = await fleet.syncLatestSnapshot();
    after = await counts(prisma);
    if (
      before.settings !== 1
      || after.settings !== 1
      || network.devices !== 1
      || network.latestPositions !== 1
      || network.historicalPositions !== 0
      || network.routesNew !== 0
      || network.telegram !== 0
      || network.openFreeMap !== 0
      || network.unexpected !== 0
      || result.historyCandidates !== result.historyInserted + result.historyDuplicates
      || after.positionHistory - before.positionHistory !== result.historyInserted
      || after.dailyStats !== before.dailyStats
      || after.alertObservations !== before.alertObservations
      || after.alertEvents !== before.alertEvents
      || after.outbox !== before.outbox
    ) throw new Error("smoke assertion");
  } catch (error) {
    console.log(`errorType: ${safeErrorType(error)}`);
    process.exitCode = 1;
  } finally {
    if (prisma && after === undefined) {
      try { after = await counts(prisma); }
      catch { console.log("errorType: database"); process.exitCode = 1; }
    }
    if (app) {
      try { await app.close(); closed = true; }
      catch { closed = false; console.log("errorType: unknown"); process.exitCode = 1; }
    }
    global.fetch = nativeFetch;
    console.log(`sync success: ${Boolean(result)}`);
    console.log(`devices received: ${result?.devicesReceived ?? 0}`);
    console.log(`positions received: ${result?.positionsReceived ?? 0}`);
    console.log(`vehicles persisted: ${result?.vehiclesUpserted ?? 0}`);
    console.log(`current states persisted: ${result?.currentStatesUpserted ?? 0}`);
    console.log(`history candidates: ${result?.historyCandidates ?? 0}`);
    console.log(`history inserted: ${result?.historyInserted ?? 0}`);
    console.log(`history duplicates: ${result?.historyDuplicates ?? 0}`);
    console.log(`history skipped invalid: ${result?.historySkippedInvalid ?? 0}`);
    console.log(`position history before: ${before?.positionHistory ?? 0}`);
    console.log(`position history after: ${after?.positionHistory ?? 0}`);
    console.log(`vehicle count before/after: ${before?.vehicles ?? 0}/${after?.vehicles ?? 0}`);
    console.log(`current state count before/after: ${before?.currentStates ?? 0}/${after?.currentStates ?? 0}`);
    console.log(`daily stat count before/after: ${before?.dailyStats ?? 0}/${after?.dailyStats ?? 0}`);
    console.log(`alert observation count before/after: ${before?.alertObservations ?? 0}/${after?.alertObservations ?? 0}`);
    console.log(`alert event count before/after: ${before?.alertEvents ?? 0}/${after?.alertEvents ?? 0}`);
    console.log(`outbox count before/after: ${before?.outbox ?? 0}/${after?.outbox ?? 0}`);
    console.log(`eQuGPS devices requests: ${network.devices}`);
    console.log(`eQuGPS latest positions requests: ${network.latestPositions}`);
    console.log(`eQuGPS historical positions requests: ${network.historicalPositions}`);
    console.log(`routes-new requests: ${network.routesNew}`);
    console.log(`Telegram requests: ${network.telegram}`);
    console.log(`OpenFreeMap requests: ${network.openFreeMap}`);
    console.log(`unexpected external requests: ${network.unexpected}`);
    console.log(`application closed: ${closed}`);
  }
}

void main().catch(() => { console.log("errorType: unknown"); process.exitCode = 1; });
