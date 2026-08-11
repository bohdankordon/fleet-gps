const { classifyRequest, isAllowedHistoricalRequest, parseTimestamp } = require("./position-history-backfill.cjs");

const maxTargetMs = 7 * 24 * 60 * 60 * 1_000;

function usageError() { return new Error("invalid arguments"); }

function parsePositiveInteger(value) {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) throw usageError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw usageError();
  return parsed;
}

function parseArguments(argv) {
  const values = new Map();
  let plan = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--plan") {
      if (plan) throw usageError();
      plan = true;
      continue;
    }
    if (!["--from", "--to", "--max-vehicles", "--max-windows"].includes(argument) || values.has(argument) || index + 1 >= argv.length || argv[index + 1].startsWith("--")) throw usageError();
    values.set(argument, argv[index + 1]);
    index += 1;
  }
  if (!values.has("--from") || !values.has("--to")) throw usageError();
  const from = parseTimestamp(values.get("--from"));
  const to = parseTimestamp(values.get("--to"));
  if (from.getTime() >= to.getTime() || to.getTime() - from.getTime() > maxTargetMs) throw usageError();
  const maxVehicles = values.has("--max-vehicles") ? parsePositiveInteger(values.get("--max-vehicles")) : undefined;
  const maxWindows = values.has("--max-windows") ? parsePositiveInteger(values.get("--max-windows")) : undefined;
  return Object.freeze({
    target: Object.freeze({ from, to }),
    options: Object.freeze({
      ...(maxVehicles === undefined ? {} : { maxVehicles }),
      ...(maxWindows === undefined ? {} : { maxWindows }),
      ...(plan ? { plan: true } : {}),
    }),
  });
}

function safeErrorType(error) {
  if (error?.name === "PositionHistoryBackfillTargetError") return "invalid_target";
  if (typeof error?.name === "string" && error.name.startsWith("EquGps")) return "provider";
  if (typeof error?.name === "string" && error.name.startsWith("Prisma")) return "database";
  if (error?.message === "invalid arguments") return "invalid_arguments";
  return "unknown";
}

function outputLines(state) {
  const result = state.result;
  const value = (key) => result === undefined ? "n/a" : result[key];
  return [
    `fleet backfill success: ${state.success}`,
    `plan: ${value("plan")}`,
    `vehicles total: ${value("vehiclesTotal")}`,
    `vehicles considered: ${value("vehiclesConsidered")}`,
    `vehicles started: ${value("vehiclesStarted")}`,
    `vehicles completed: ${value("vehiclesCompleted")}`,
    `vehicles already completed: ${value("vehiclesAlreadyCompleted")}`,
    `vehicles remaining: ${value("vehiclesRemaining")}`,
    `pending vehicles: ${value("pendingVehicles")}`,
    `partial vehicles: ${value("partialVehicles")}`,
    `unmapped vehicles: ${value("unmappedVehicles")}`,
    `estimated remaining windows: ${value("estimatedRemainingWindows")}`,
    `windows requested: ${value("windowsRequested")}`,
    `provider requests: ${value("providerRequests")}`,
    `provider rows: ${value("providerRows")}`,
    `history candidates: ${value("candidates")}`,
    `history inserted: ${value("inserted")}`,
    `history duplicates: ${value("duplicates")}`,
    `history skipped invalid: ${value("invalid")}`,
    `retries: ${value("retries")}`,
    `rate-limit responses: ${value("rateLimitResponses")}`,
    `stopped by budget: ${value("stoppedByBudget")}`,
    `eQuGPS devices requests: ${state.network.devices}`,
    `eQuGPS latest positions requests: ${state.network.latestPositions}`,
    `eQuGPS historical positions requests: ${state.network.historicalPositions}`,
    `routes-new requests: ${state.network.routesNew}`,
    `Telegram requests: ${state.network.telegram}`,
    `OpenFreeMap requests: ${state.network.openFreeMap}`,
    `unexpected external requests: ${state.network.unexpected}`,
    `application closed: ${state.applicationClosed}`,
    `error type: ${state.errorType ?? "none"}`,
  ];
}

async function run(argv, dependencies = {}) {
  const output = dependencies.output ?? ((line) => console.log(line));
  const state = { success: false, result: undefined, errorType: undefined, applicationClosed: true, network: { devices: 0, latestPositions: 0, historicalPositions: 0, routesNew: 0, telegram: 0, openFreeMap: 0, unexpected: 0 } };
  let app;
  let nativeFetch;
  try {
    const { target, options } = parseArguments(argv);
    (dependencies.loadRootEnv ?? require("./load-root-env.cjs").loadRootEnv)();
    process.env.SYNC_SCHEDULER_ENABLED = "false";
    process.env.ALERT_INGESTION_ENABLED = "false";
    process.env.TELEGRAM_NOTIFICATIONS_ENABLED = "false";
    nativeFetch = global.fetch;
    global.fetch = async (input, init) => {
      const value = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      let kind = classifyRequest(value);
      if (kind === "historicalPositions" && !isAllowedHistoricalRequest(value, process.env.EQUGPS_BASE_URL)) kind = "unexpected";
      state.network[kind] += 1;
      if (kind !== "historicalPositions" || options.plan === true) throw new Error("Unexpected external request");
      return nativeFetch(input, init);
    };
    const Module = dependencies.Module ?? require("../dist/modules/position-history-backfill").PositionHistoryBackfillModule;
    const Service = dependencies.Service ?? require("../dist/modules/position-history-backfill").PositionHistoryFleetBackfillService;
    if (dependencies.createApplicationContext !== undefined) app = await dependencies.createApplicationContext(Module, { logger: false, abortOnError: false });
    else app = await (dependencies.NestFactory ?? require("@nestjs/core").NestFactory).createApplicationContext(Module, { logger: false, abortOnError: false });
    state.applicationClosed = false;
    state.result = await app.get(Service).run(target, options);
    if (state.network.historicalPositions !== state.result.providerRequests || Object.entries(state.network).some(([key, count]) => key !== "historicalPositions" && count !== 0)) throw new Error("network assertion");
    state.success = true;
    return 0;
  } catch (error) {
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

module.exports = { outputLines, parseArguments, parsePositiveInteger, run };
