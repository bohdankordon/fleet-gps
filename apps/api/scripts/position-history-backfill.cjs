const zonedIsoDateTime = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function usageError() { return new Error("invalid arguments"); }

function parseTimestamp(value) {
  const match = typeof value === "string" ? zonedIsoDateTime.exec(value) : null;
  if (match === null) throw usageError();
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone, , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) throw usageError();
  if (zone !== "Z") {
    const offsetHour = Number(offsetHourText);
    const offsetMinute = Number(offsetMinuteText);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) throw usageError();
  }
  if (!Number.isFinite(Date.parse(value))) throw usageError();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw usageError();
  return parsed;
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--vehicle", "--from", "--to", "--max-windows"].includes(argument) || values.has(argument) || index + 1 >= argv.length || argv[index + 1].startsWith("--")) throw usageError();
    values.set(argument, argv[index + 1]);
    index += 1;
  }
  const allowed = new Set(["--vehicle", "--from", "--to", "--max-windows"]);
  if ([...values.keys()].some((value) => !allowed.has(value)) || values.size < 3 || values.size > 4 || !uuid.test(values.get("--vehicle") ?? "")) throw usageError();
  const from = parseTimestamp(values.get("--from"));
  const to = parseTimestamp(values.get("--to"));
  if (from.getTime() >= to.getTime()) throw usageError();
  const rawMaxWindows = values.get("--max-windows");
  const maxWindows = rawMaxWindows === undefined ? undefined : Number(rawMaxWindows);
  if (maxWindows !== undefined && (!/^[0-9]+$/.test(rawMaxWindows) || !Number.isInteger(maxWindows) || maxWindows < 1 || maxWindows > 168)) throw usageError();
  return Object.freeze({ target: Object.freeze({ vehicleId: values.get("--vehicle"), from, to }), options: Object.freeze(maxWindows === undefined ? {} : { maxWindows }) });
}

function classifyRequest(value) {
  const url = new URL(value);
  if (url.pathname.endsWith("/api/devices/routes-new")) return "routesNew";
  if (url.hostname === "api.telegram.org") return "telegram";
  if (url.hostname.includes("openfreemap")) return "openFreeMap";
  if (url.pathname.endsWith("/devices")) return "devices";
  if (url.pathname.endsWith("/positions")) return url.search === "" ? "latestPositions" : "historicalPositions";
  return "unexpected";
}

function isAllowedHistoricalRequest(value, officialBaseUrl) {
  try {
    const url = new URL(value);
    const base = new URL(officialBaseUrl);
    const expectedPath = `${base.pathname.replace(/\/$/, "")}/positions`;
    return url.origin === base.origin
      && url.pathname === expectedPath
      && JSON.stringify([...url.searchParams.keys()].sort()) === JSON.stringify(["deviceId", "from", "to"])
      && [...url.searchParams.values()].every((entry) => entry.length > 0);
  } catch { return false; }
}

function safeErrorType(error) {
  if (error && error.name === "PositionHistoryBackfillTargetError") return "invalid_target";
  if (error && error.name === "PositionHistoryBackfillVehicleNotFoundError") return "vehicle_not_found";
  if (error && typeof error.name === "string" && error.name.startsWith("EquGps")) return "provider";
  if (error && typeof error.name === "string" && error.name.startsWith("Prisma")) return "database";
  if (error && error.message === "invalid arguments") return "invalid_arguments";
  return "unknown";
}

function outputLines(state) {
  const result = state.result;
  return [
    `backfill success: ${Boolean(result)}`,
    `already completed: ${result?.alreadyCompleted ?? false}`,
    `resumed: ${result?.resumed ?? false}`,
    `provider requests: ${result?.requests ?? 0}`,
    `provider rows: ${result?.providerRows ?? 0}`,
    `history candidates: ${result?.historyCandidates ?? 0}`,
    `history inserted: ${result?.historyInserted ?? 0}`,
    `history duplicates: ${result?.historyDuplicates ?? 0}`,
    `history skipped invalid: ${result?.historySkippedInvalid ?? 0}`,
    `windows completed: ${result?.windowsCompleted ?? 0}`,
    `retries: ${result?.retries ?? 0}`,
    `rate-limit responses: ${result?.rateLimitResponses ?? 0}`,
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
  const state = { result: undefined, errorType: undefined, applicationClosed: true, network: { devices: 0, latestPositions: 0, historicalPositions: 0, routesNew: 0, telegram: 0, openFreeMap: 0, unexpected: 0 } };
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
      if (kind !== "historicalPositions") throw new Error("Unexpected external request");
      return nativeFetch(input, init);
    };
    const Module = dependencies.Module ?? require("../dist/modules/position-history-backfill").PositionHistoryBackfillModule;
    const Service = dependencies.Service ?? require("../dist/modules/position-history-backfill").PositionHistoryBackfillService;
    if (dependencies.createApplicationContext !== undefined) app = await dependencies.createApplicationContext(Module, { logger: false, abortOnError: false });
    else app = await (dependencies.NestFactory ?? require("@nestjs/core").NestFactory).createApplicationContext(Module, { logger: false, abortOnError: false });
    state.applicationClosed = false;
    state.result = await app.get(Service).run(target, options);
    if (state.network.historicalPositions !== state.result.requests || Object.entries(state.network).some(([key, count]) => key !== "historicalPositions" && count !== 0)) throw new Error("network assertion");
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

module.exports = { classifyRequest, isAllowedHistoricalRequest, outputLines, parseArguments, parseTimestamp, run };
