const { classifyRequest, isAllowedHistoricalRequest, parseTimestamp } = require("./position-history-backfill.cjs");
const providerFailureDiagnostics = require("../dist/modules/position-history-backfill/position-history-backfill-failure-diagnostics");

function usageError() { return new Error("invalid arguments"); }

function parsePositiveInteger(value) {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) throw usageError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw usageError();
  return parsed;
}

function parseArguments(argv) {
  const values = new Map();
  let excludeProviderDisabled = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--exclude-provider-disabled") {
      if (excludeProviderDisabled) throw usageError();
      excludeProviderDisabled = true;
      continue;
    }
    if (!["--to", "--max-windows"].includes(argument) || values.has(argument) || index + 1 >= argv.length || argv[index + 1].startsWith("--")) throw usageError();
    values.set(argument, argv[index + 1]);
    index += 1;
  }
  if (values.size !== 2 || !values.has("--to") || !values.has("--max-windows")) throw usageError();
  return Object.freeze({
    to: parseTimestamp(values.get("--to")),
    options: Object.freeze({ maxWindows: parsePositiveInteger(values.get("--max-windows")), ...(excludeProviderDisabled ? { excludeProviderDisabled: true } : {}) }),
  });
}

function safeErrorType(error) {
  if (error?.name === "PositionHistoryBackfillTargetError") return "invalid_target";
  if ((typeof error?.name === "string" && error.name.startsWith("EquGps")) || error?.name === "PositionHistoryBackfillProviderContractError") return "provider";
  if (typeof error?.name === "string" && error.name.startsWith("Prisma")) return "database";
  if (error?.message === "invalid arguments") return "invalid_arguments";
  return "unknown";
}

function safeProviderDiagnostic(error) {
  const recorded = providerFailureDiagnostics.recordedPositionHistoryBackfillProviderFailure(error);
  return recorded ?? providerFailureDiagnostics.classifyPositionHistoryBackfillProviderFailure(error, { maxRetryAfterMs: 60_000 });
}

function instant(value) { return value === null || value === undefined ? "none" : value.toISOString(); }

function outputLines(state) {
  const result = state.result;
  const value = (key) => result === undefined ? "n/a" : result[key];
  const failure = state.errorType !== undefined;
  return [
    `horizon population success: ${state.success}`,
    `horizon from: ${instant(result?.horizonFrom)}`,
    `horizon to: ${instant(result?.horizonTo)}`,
    `policy days: ${value("policyDays")}`,
    `slices total: ${value("slicesTotal")}`,
    `slices visited: ${value("slicesVisited")}`,
    `slices already complete: ${value("slicesAlreadyComplete")}`,
    `provider-disabled excluded: ${value("providerDisabledExcluded")}`,
    `committed windows: ${value("windowsRequested")}`,
    `provider requests: ${value("providerRequests")}`,
    `provider rows: ${value("providerRows")}`,
    `history candidates: ${value("candidates")}`,
    `history inserted: ${value("inserted")}`,
    `history duplicates: ${value("duplicates")}`,
    `history skipped invalid: ${value("invalid")}`,
    `retries: ${value("retries")}`,
    `rate-limit responses: ${value("rateLimitResponses")}`,
    `stopped by budget: ${value("stoppedByBudget")}`,
    `horizon complete: ${value("horizonComplete")}`,
    `current slice from: ${instant(result?.currentSliceFrom)}`,
    `current slice to: ${instant(result?.currentSliceTo)}`,
    ...(failure && result !== undefined ? ["current slice result-derived counters: n/a", "reported counters scope: completed prior slices only"] : []),
    `eQuGPS devices requests: ${state.network.devices}`,
    `eQuGPS latest positions requests: ${state.network.latestPositions}`,
    `eQuGPS historical positions requests: ${state.network.historicalPositions}`,
    `routes-new requests: ${state.network.routesNew}`,
    `Telegram requests: ${state.network.telegram}`,
    `OpenFreeMap requests: ${state.network.openFreeMap}`,
    `unexpected external requests: ${state.network.unexpected}`,
    `application closed: ${state.applicationClosed}`,
    `error type: ${state.errorType ?? "none"}`,
    ...(state.providerDiagnostic === undefined ? [] : [
      `provider category: ${state.providerDiagnostic.category}`,
      ...(state.providerDiagnostic.status === undefined ? [] : [`provider HTTP status: ${state.providerDiagnostic.status}`]),
      ...(state.providerDiagnostic.retryable === undefined ? [] : [`provider retryable: ${state.providerDiagnostic.retryable}`]),
      ...(state.providerDiagnostic.retryAfterPolicy === undefined ? [] : [`provider retry-after policy: ${state.providerDiagnostic.retryAfterPolicy}`]),
      ...(state.providerDiagnostic.diagnosticCode === undefined ? [] : [`provider diagnostic code: ${state.providerDiagnostic.diagnosticCode}`]),
    ]),
  ];
}

async function run(argv, dependencies = {}) {
  const output = dependencies.output ?? ((line) => console.log(line));
  const state = { success: false, result: undefined, errorType: undefined, providerDiagnostic: undefined, applicationClosed: true, network: { devices: 0, latestPositions: 0, historicalPositions: 0, routesNew: 0, telegram: 0, openFreeMap: 0, unexpected: 0 } };
  let app;
  let nativeFetch;
  try {
    const { to, options } = parseArguments(argv);
    (dependencies.loadRootEnv ?? require("./load-root-env.cjs").loadRootEnv)();
    process.env.SYNC_SCHEDULER_ENABLED = "false";
    process.env.ALERT_INGESTION_ENABLED = "false";
    process.env.TELEGRAM_NOTIFICATIONS_ENABLED = "false";
    nativeFetch = global.fetch;
    global.fetch = async (input, init) => {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      let kind = classifyRequest(raw);
      if (kind === "historicalPositions" && !isAllowedHistoricalRequest(raw, process.env.EQUGPS_BASE_URL)) kind = "unexpected";
      state.network[kind] += 1;
      if (kind !== "historicalPositions") throw new Error("Unexpected external request");
      return nativeFetch(input, init);
    };
    const Module = dependencies.Module ?? require("../dist/modules/position-history-horizon-population").PositionHistoryHorizonPopulationModule;
    const Service = dependencies.Service ?? require("../dist/modules/position-history-horizon-population").PositionHistoryHorizonPopulationService;
    if (dependencies.createApplicationContext !== undefined) app = await dependencies.createApplicationContext(Module, { logger: false, abortOnError: false });
    else app = await (dependencies.NestFactory ?? require("@nestjs/core").NestFactory).createApplicationContext(Module, { logger: false, abortOnError: false });
    state.applicationClosed = false;
    state.result = await app.get(Service).run(to, options);
    if (state.network.historicalPositions !== state.result.providerRequests || Object.entries(state.network).some(([key, count]) => key !== "historicalPositions" && count !== 0)) throw new Error("network assertion");
    state.success = true;
    return 0;
  } catch (error) {
    const populationError = error?.name === "PositionHistoryHorizonPopulationError" ? error : undefined;
    if (populationError !== undefined) state.result = populationError.progress;
    const underlying = populationError?.underlyingError ?? error;
    state.errorType = safeErrorType(underlying);
    if (state.errorType === "provider") state.providerDiagnostic = safeProviderDiagnostic(underlying);
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

module.exports = { outputLines, parseArguments, parsePositiveInteger, run, safeProviderDiagnostic };
