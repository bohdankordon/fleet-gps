function safeErrorType(error) {
  if (error && error.name === "ApiConfigurationError") return "configuration";
  if (error && typeof error.name === "string" && error.name.startsWith("EquGps")) return "equgps";
  if (error && typeof error.name === "string" && error.name.startsWith("Prisma")) return "database";
  return "unknown";
}

async function main() {
  let app;
  let result;
  let counts = { vehicles: 0, states: 0, withPosition: 0, withoutPosition: 0, settings: 0, dailyStats: 0 };
  let requests = 0;
  let closed = true;
  const nativeFetch = global.fetch;
  require("./load-root-env.cjs").loadRootEnv();
  global.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.startsWith("http://127.0.0.1:")) requests += 1;
    return nativeFetch(input, init);
  };
  try {
    const { NestFactory } = require("@nestjs/core");
    const { AppModule } = require("../dist/app.module");
    const { FleetSyncService } = require("../dist/modules/fleet/fleet-sync.service");
    const { DatabaseService } = require("../dist/modules/database/database.service");
    app = await NestFactory.createApplicationContext(AppModule, { logger: false, abortOnError: false });
    closed = false;
    const fleet = app.get(FleetSyncService);
    const database = app.get(DatabaseService);
    result = await fleet.syncLatestSnapshot();
    const prisma = database.getClient();
    counts.vehicles = await prisma.vehicle.count();
    counts.states = await prisma.vehicleCurrentState.count();
    counts.withPosition = await prisma.vehicleCurrentState.count({ where: { latitude: { not: null }, longitude: { not: null } } });
    counts.withoutPosition = counts.states - counts.withPosition;
    counts.settings = await prisma.applicationSettings.count();
    counts.dailyStats = await prisma.dailyVehicleStat.count();
    if (counts.settings !== 1 || counts.dailyStats !== 0 || requests !== 2) throw new Error("smoke assertion");
  } catch (error) {
    console.log(`errorType: ${safeErrorType(error)}`);
    process.exitCode = 1;
  } finally {
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
    console.log(`devices without position: ${result?.devicesWithoutPosition ?? 0}`);
    console.log(`unmatched positions: ${result?.unmatchedPositions ?? 0}`);
    console.log(`duplicate positions: ${result?.duplicatePositions ?? 0}`);
    console.log(`vehicle count: ${counts.vehicles}`);
    console.log(`current state count: ${counts.states}`);
    console.log(`states with position: ${counts.withPosition}`);
    console.log(`states without position: ${counts.withoutPosition}`);
    console.log(`settings count: ${counts.settings}`);
    console.log(`daily stat count: ${counts.dailyStats}`);
    console.log(`http requests: ${requests}`);
    console.log(`application closed: ${closed}`);
  }
}

void main().catch(() => { console.log("errorType: unknown"); process.exitCode = 1; });
