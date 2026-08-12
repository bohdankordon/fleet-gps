const { parseTimestamp } = require("./position-history-backfill.cjs");

const maxTargetMs = 7 * 24 * 60 * 60 * 1_000;

function usageError() { return new Error("invalid arguments"); }

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--from", "--to"].includes(argument) || values.has(argument) || index + 1 >= argv.length || argv[index + 1].startsWith("--")) throw usageError();
    values.set(argument, argv[index + 1]);
    index += 1;
  }
  if (values.size !== 2 || !values.has("--from") || !values.has("--to")) throw usageError();
  const from = parseTimestamp(values.get("--from"));
  const to = parseTimestamp(values.get("--to"));
  if (from.getTime() >= to.getTime() || to.getTime() - from.getTime() > maxTargetMs) throw usageError();
  return Object.freeze({ from, to });
}

function instant(value) { return value === null || value === undefined ? "null" : value.toISOString(); }

function outputLines(state) {
  if (state.result === undefined) return [
    "position history coverage audit success: false",
    `network requests: ${state.networkRequests}`,
    `application closed: ${state.applicationClosed}`,
    `error type: ${state.errorType ?? "unknown"}`,
  ];
  const result = state.result;
  const checkpoints = result.checkpointCoverage;
  const observations = result.observationPresence;
  const cross = result.checkpointObservationCrossSummary;
  return [
    "position history coverage audit success: true",
    `range from: ${result.range.from.toISOString()}`,
    `range to: ${result.range.to.toISOString()}`,
    "observation range inclusive: true",
    `vehicles total: ${checkpoints.vehiclesTotal}`,
    `exact checkpoint COMPLETED: ${checkpoints.completed}`,
    `exact checkpoint RUNNING: ${checkpoints.running}`,
    `exact checkpoint PENDING: ${checkpoints.pending}`,
    `no exact checkpoint: ${checkpoints.noExactCheckpoint}`,
    `provider-disabled vehicles: ${result.providerDisabledVehicles}`,
    `observation rows: ${observations.rowsTotal}`,
    `vehicles with observations: ${observations.vehiclesWithObservations}`,
    `vehicles with zero observations: ${observations.vehiclesWithoutObservations}`,
    `FLEET_SYNC rows: ${observations.fleetSyncRows}`,
    `HISTORICAL_BACKFILL rows: ${observations.historicalBackfillRows}`,
    `first observedAt: ${instant(observations.firstObservedAt)}`,
    `last observedAt: ${instant(observations.lastObservedAt)}`,
    `COMPLETED exact checkpoint + observations: ${cross.completedWithObservations}`,
    `COMPLETED exact checkpoint + zero observations: ${cross.completedWithoutObservations}`,
    `incomplete/no exact checkpoint + observations: ${cross.incompleteOrNoExactCheckpointWithObservations}`,
    `incomplete/no exact checkpoint + zero observations: ${cross.incompleteOrNoExactCheckpointWithoutObservations}`,
    `network requests: ${state.networkRequests}`,
    `application closed: ${state.applicationClosed}`,
    "error type: none",
  ];
}

function safeErrorType(error) {
  if (error?.message === "invalid arguments") return "invalid_arguments";
  if (typeof error?.name === "string" && error.name.startsWith("Prisma")) return "database";
  return "unknown";
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
    const Module = dependencies.Module ?? require("../dist/modules/position-history-coverage").PositionHistoryCoverageModule;
    const Service = dependencies.Service ?? require("../dist/modules/position-history-coverage").PositionHistoryCoverageService;
    if (dependencies.createApplicationContext !== undefined) app = await dependencies.createApplicationContext(Module, { logger: false, abortOnError: false });
    else app = await (dependencies.NestFactory ?? require("@nestjs/core").NestFactory).createApplicationContext(Module, { logger: false, abortOnError: false });
    state.applicationClosed = false;
    state.result = await app.get(Service).run(target);
    if (state.networkRequests !== 0) throw new Error("network assertion");
    return 0;
  } catch (error) {
    state.errorType = safeErrorType(error);
    state.result = undefined;
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

module.exports = { outputLines, parseArguments, run };
