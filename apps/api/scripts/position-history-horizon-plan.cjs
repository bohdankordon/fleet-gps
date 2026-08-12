const { parseTimestamp } = require("./position-history-backfill.cjs");

function usageError() { return new Error("invalid arguments"); }

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== "--to" || argv[1].startsWith("--")) throw usageError();
  return Object.freeze({ to: parseTimestamp(argv[1]) });
}

function hours(durationMs) { return durationMs / (60 * 60 * 1_000); }

function outputLines(state) {
  if (state.result === undefined) return [
    "position history horizon plan success: false",
    `network requests: ${state.networkRequests}`,
    `application closed: ${state.applicationClosed}`,
    `error type: ${state.errorType ?? "unknown"}`,
  ];
  const result = state.result;
  const lines = [
    "position history horizon plan success: true",
    `horizon from: ${result.horizon.from.toISOString()}`,
    `horizon to: ${result.horizon.to.toISOString()}`,
    `policy days: ${result.horizon.policyDays}`,
    `target slices: ${result.targets.total}`,
    `full 7-day slices: ${result.targets.fullSevenDay}`,
    `remainder slice hours: ${result.targets.remainderDurationMs === null ? "none" : hours(result.targets.remainderDurationMs)}`,
    `vehicles total: ${result.fleet.total}`,
    `provider-disabled vehicles: ${result.fleet.providerDisabled}`,
    `provider-eligible vehicles: ${result.fleet.providerEligible}`,
    `target-vehicle pairs total: ${result.targetVehiclePairs.total}`,
    `completed target-vehicle pairs: ${result.targetVehiclePairs.completed}`,
    `incomplete target-vehicle pairs: ${result.targetVehiclePairs.incomplete}`,
    `provider-eligible incomplete target-vehicle pairs: ${result.targetVehiclePairs.providerEligibleIncomplete}`,
    `estimated remaining hourly windows: ${result.estimatedRemainingHourlyWindows}`,
  ];
  for (const slice of result.slices) lines.push(
    `slice ${slice.index + 1}: from=${slice.from.toISOString()} to=${slice.to.toISOString()} durationHours=${hours(slice.durationMs)} COMPLETED=${slice.completed} RUNNING=${slice.running} PENDING=${slice.pending} NONE=${slice.noExactCheckpoint} providerDisabled=${slice.providerDisabledVehicles} remainingFleet=${slice.remainingFleetVehicles} providerEligibleRemaining=${slice.providerEligibleRemaining} estimatedRemainingHourlyWindows=${slice.estimatedRemainingHourlyWindows}`,
  );
  lines.push(`network requests: ${state.networkRequests}`, `application closed: ${state.applicationClosed}`, "error type: none");
  return lines;
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
    const { to } = parseArguments(argv);
    (dependencies.loadRootEnv ?? require("./load-root-env.cjs").loadRootEnv)();
    process.env.SYNC_SCHEDULER_ENABLED = "false";
    process.env.ALERT_INGESTION_ENABLED = "false";
    process.env.TELEGRAM_NOTIFICATIONS_ENABLED = "false";
    nativeFetch = global.fetch;
    global.fetch = async () => { state.networkRequests += 1; throw new Error("Unexpected external request"); };
    const Module = dependencies.Module ?? require("../dist/modules/position-history-horizon").PositionHistoryHorizonModule;
    const Service = dependencies.Service ?? require("../dist/modules/position-history-horizon").PositionHistoryHorizonService;
    if (dependencies.createApplicationContext !== undefined) app = await dependencies.createApplicationContext(Module, { logger: false, abortOnError: false });
    else app = await (dependencies.NestFactory ?? require("@nestjs/core").NestFactory).createApplicationContext(Module, { logger: false, abortOnError: false });
    state.applicationClosed = false;
    state.result = await app.get(Service).run(to);
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
