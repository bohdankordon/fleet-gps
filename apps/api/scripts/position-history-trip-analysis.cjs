const { parseTimestamp } = require("./position-history-backfill.cjs");

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxRangeMs = 7 * 24 * 60 * 60 * 1_000;

function usageError() { return new Error("invalid arguments"); }

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--vehicle", "--from", "--to"].includes(argument) || values.has(argument) || index + 1 >= argv.length || argv[index + 1].startsWith("--")) throw usageError();
    values.set(argument, argv[index + 1]);
    index += 1;
  }
  if (values.size !== 3 || !uuid.test(values.get("--vehicle") ?? "")) throw usageError();
  const from = parseTimestamp(values.get("--from"));
  const to = parseTimestamp(values.get("--to"));
  if (from.getTime() >= to.getTime() || to.getTime() - from.getTime() > maxRangeMs) throw usageError();
  return Object.freeze({ vehicleId: values.get("--vehicle"), range: Object.freeze({ from, to }) });
}

function safeErrorType(error) {
  if (error?.message === "invalid arguments") return "invalid_arguments";
  if (error?.name === "TripStopAnalyticsTargetError") return "invalid_target";
  if (error?.name === "TripStopAnalyticsVehicleNotFoundError") return "vehicle_not_found";
  if (typeof error?.name === "string" && error.name.startsWith("Prisma")) return "database";
  return "unknown";
}

function outputLines(state) {
  if (state.result === undefined) return [
    "trip/stop analysis success: false",
    `network requests: ${state.networkRequests}`,
    `application closed: ${state.applicationClosed}`,
    `error type: ${state.errorType ?? "unknown"}`,
  ];
  const result = state.result;
  return [
    "trip/stop analysis success: true",
    `vehicle: ${result.vehicle.id}`,
    `vehicle name: ${result.vehicle.name}`,
    `range from: ${result.range.from.toISOString()}`,
    `range to: ${result.range.to.toISOString()}`,
    "observation range inclusive: true",
    `raw observations: ${result.summary.rawObservationCount}`,
    `continuity segments: ${result.summary.continuitySegmentCount}`,
    `trips: ${result.summary.tripCount}`,
    `stops: ${result.summary.stopCount}`,
    `data gaps: ${result.summary.gapCount}`,
    `total GPS-observed trip distance meters: ${result.summary.totalObservedTripDistanceMeters}`,
    `first observation: ${result.summary.firstObservationAt?.toISOString() ?? "null"}`,
    `last observation: ${result.summary.lastObservationAt?.toISOString() ?? "null"}`,
    `trip results: ${JSON.stringify(result.trips)}`,
    `stop results: ${JSON.stringify(result.stops)}`,
    `gap results: ${JSON.stringify(result.gaps)}`,
    `network requests: ${state.networkRequests}`,
    `application closed: ${state.applicationClosed}`,
    "error type: none",
  ];
}

async function run(argv, dependencies = {}) {
  const output = dependencies.output ?? ((line) => console.log(line));
  const state = { result: undefined, errorType: undefined, applicationClosed: true, networkRequests: 0 };
  let app;
  let nativeFetch;
  try {
    const target = parseArguments(argv);
    (dependencies.loadRootEnv ?? require("./load-root-env.cjs").loadRootEnv)();
    process.env.SYNC_SCHEDULER_ENABLED = "false";
    process.env.ALERT_INGESTION_ENABLED = "false";
    process.env.TELEGRAM_NOTIFICATIONS_ENABLED = "false";
    nativeFetch = global.fetch;
    global.fetch = async () => { state.networkRequests += 1; throw new Error("Unexpected external request"); };
    const Module = dependencies.Module ?? require("../dist/modules/trip-stop-analytics").TripStopAnalyticsModule;
    const Service = dependencies.Service ?? require("../dist/modules/trip-stop-analytics").TripStopAnalyticsService;
    if (dependencies.createApplicationContext !== undefined) app = await dependencies.createApplicationContext(Module, { logger: false, abortOnError: false });
    else app = await (dependencies.NestFactory ?? require("@nestjs/core").NestFactory).createApplicationContext(Module, { logger: false, abortOnError: false });
    state.applicationClosed = false;
    state.result = await app.get(Service).analyze(target.vehicleId, target.range);
    if (state.networkRequests !== 0) throw new Error("network assertion");
    return 0;
  } catch (error) {
    state.result = undefined;
    state.errorType = safeErrorType(error);
    return 1;
  } finally {
    if (app !== undefined) {
      try { await app.close(); state.applicationClosed = true; }
      catch { state.applicationClosed = false; }
    }
    if (nativeFetch !== undefined) global.fetch = nativeFetch;
    for (const line of outputLines(state)) output(line);
  }
}

if (require.main === module) void run(process.argv.slice(2)).then((code) => { process.exitCode = code; });

module.exports = { outputLines, parseArguments, run, safeErrorType };

