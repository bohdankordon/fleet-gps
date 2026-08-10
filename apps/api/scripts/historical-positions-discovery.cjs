const crypto = require("node:crypto");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("../dist/generated/prisma/client");
const { FetchHttpTransport, createOfficialEquGpsClient } = require("@taxi-gps/equgps");

const pacingMs = 350;
let activePrisma;

function sleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function parsePlan(argv) {
  const value = argv.find((argument) => argument.startsWith("--plan="))?.slice("--plan=".length) ?? "narrow";
  if (value !== "narrow" && value !== "sample" && value !== "partition") throw new Error("invalid arguments");
  return value;
}

function safeErrorType(error) {
  if (error && error.name === "ApiConfigurationError") return "configuration";
  if (error && typeof error.name === "string" && error.name.startsWith("EquGps")) return error.name;
  if (error && typeof error.name === "string" && error.name.startsWith("Prisma")) return "database";
  return "unknown";
}

function identity(position) {
  return JSON.stringify([
    position.fixTime,
    position.latitude,
    position.longitude,
    position.speedKnots,
  ]);
}

function digest(positions) {
  const canonical = positions.map(identity).sort().join("\n");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function observedTimes(positions) {
  return positions.flatMap((position) => {
    if (typeof position.fixTime !== "string") return [];
    const value = Date.parse(position.fixTime);
    return Number.isFinite(value) ? [value] : [];
  });
}

function orderOf(times) {
  if (times.length < 2) return "not_applicable";
  let ascending = true;
  let descending = true;
  for (let index = 1; index < times.length; index += 1) {
    if (times[index] < times[index - 1]) ascending = false;
    if (times[index] > times[index - 1]) descending = false;
  }
  if (ascending) return "ascending";
  if (descending) return "descending";
  return "mixed";
}

function duplicateStats(positions) {
  const identities = positions.map(identity);
  const identityCounts = new Map();
  const timeIdentities = new Map();
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index];
    const value = identities[index];
    identityCounts.set(value, (identityCounts.get(value) ?? 0) + 1);
    const key = position.fixTime ?? "null";
    const values = timeIdentities.get(key) ?? new Set();
    values.add(value);
    timeIdentities.set(key, values);
  }
  return {
    exactDuplicateRows: [...identityCounts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0),
    sameTimeDistinctFixGroups: [...timeIdentities.values()].filter((values) => values.size > 1).length,
  };
}

function rawContract(body) {
  if (!Array.isArray(body)) return { responseKind: typeof body };
  const keys = new Set();
  let rowsWithId = 0;
  const ids = new Set();
  for (const row of body) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) continue;
    for (const key of Object.keys(row)) keys.add(key);
    if (Number.isInteger(row.id)) {
      rowsWithId += 1;
      ids.add(row.id);
    }
  }
  return {
    responseKind: "array",
    rawRows: body.length,
    rawKeys: [...keys].sort(),
    rowsWithStableNumericId: rowsWithId,
    distinctStableNumericIds: ids.size,
    stableNumericIdDigest: crypto.createHash("sha256").update([...ids].sort((left, right) => left - right).join(",")).digest("hex"),
  };
}

function summarize(label, positions, raw, durationMs) {
  const times = observedTimes(positions);
  const precisions = new Set(positions.flatMap((position) => {
    if (typeof position.fixTime !== "string") return [];
    const match = /\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/.exec(position.fixTime);
    return [match?.[1]?.length ?? 0];
  }));
  const invalidCoordinates = positions.filter((position) =>
    position.latitude === null || !Number.isFinite(position.latitude) || position.latitude < -90 || position.latitude > 90
    || position.longitude === null || !Number.isFinite(position.longitude) || position.longitude < -180 || position.longitude > 180
  ).length;
  const duplicates = duplicateStats(positions);
  return {
    label,
    durationMs,
    rows: positions.length,
    digest: digest(positions),
    firstObservedAt: times.length === 0 ? null : new Date(Math.min(...times)).toISOString(),
    lastObservedAt: times.length === 0 ? null : new Date(Math.max(...times)).toISOString(),
    order: orderOf(times),
    timestampFractionDigits: [...precisions].sort((left, right) => left - right),
    missingObservedAt: positions.length - times.length,
    invalidCoordinates,
    nullableSpeedRows: positions.filter((position) => position.speedKnots === null).length,
    validFalseRows: positions.filter((position) => position.valid === false).length,
    outdatedTrueRows: positions.filter((position) => position.outdated === true).length,
    ...duplicates,
    ...rawContract(raw.body),
    status: raw.status,
    contentType: raw.headers["content-type"] ?? null,
    paginationHeadersPresent: raw.paginationHeaders,
  };
}

function iso(value) {
  return new Date(value).toISOString();
}

function shiftedIso(value, hours) {
  const date = new Date(value);
  const shifted = new Date(date.getTime() + hours * 60 * 60 * 1_000);
  const sign = hours >= 0 ? "+" : "-";
  const magnitude = Math.abs(hours).toString().padStart(2, "0");
  return `${shifted.toISOString().slice(0, -1)}${sign}${magnitude}:00`;
}

class GuardedHistoricalTransport {
  constructor(config) {
    this.config = config;
    this.inner = new FetchHttpTransport();
    this.requests = 0;
    this.rateLimits = 0;
    this.raw = null;
  }

  async execute(request) {
    const base = new URL(this.config.officialBaseUrl);
    const url = new URL(request.url);
    const keys = [...url.searchParams.keys()].sort();
    const expectedPath = `${base.pathname.replace(/\/$/, "")}/positions`;
    if (
      request.operation !== "getHistoricalPositions"
      || request.method !== "GET"
      || url.origin !== base.origin
      || url.pathname !== expectedPath
      || JSON.stringify(keys) !== JSON.stringify(["deviceId", "from", "to"])
    ) throw new Error("network scope violation");
    this.requests += 1;
    try {
      const response = await this.inner.execute(request);
      this.raw = {
        status: response.status,
        headers: response.headers,
        body: response.body,
        paginationHeaders: [],
      };
      return response;
    } catch (error) {
      if (error && error.status === 429) this.rateLimits += 1;
      throw error;
    }
  }
}

async function runRequest(client, transport, label, deviceId, from, to, output) {
  if (output.length > 0) await sleep(pacingMs);
  const startedAt = performance.now();
  const positions = await client.getHistoricalPositions({ deviceId, from, to });
  const durationMs = Math.round(performance.now() - startedAt);
  if (transport.raw === null) throw new Error("missing response metadata");
  output.push(summarize(label, positions, transport.raw, durationMs));
  return positions;
}

async function narrowPlan(client, transport, vehicle, output) {
  const toMs = vehicle.currentState.fixTime.getTime() + 1_000;
  const oneHourFrom = iso(toMs - 60 * 60 * 1_000);
  const to = iso(toMs);
  const oneHour = await runRequest(client, transport, "one-hour", vehicle.externalDeviceId, oneHourFrom, to, output);
  const repeated = await runRequest(client, transport, "one-hour-repeat", vehicle.externalDeviceId, oneHourFrom, to, output);
  await runRequest(client, transport, "six-hours", vehicle.externalDeviceId, iso(toMs - 6 * 60 * 60 * 1_000), to, output);
  const day = await runRequest(client, transport, "twenty-four-hours", vehicle.externalDeviceId, iso(toMs - 24 * 60 * 60 * 1_000), to, output);
  await runRequest(client, transport, "one-hour-offset", vehicle.externalDeviceId, shiftedIso(oneHourFrom, 2), shiftedIso(to, 2), output);

  const boundarySource = oneHour.length > 0 ? oneHour : day;
  const boundary = boundarySource.find((position) => typeof position.fixTime === "string" && Number.isFinite(Date.parse(position.fixTime)));
  let boundaryResult = null;
  if (boundary !== undefined) {
    const pointTime = Date.parse(boundary.fixTime);
    const left = await runRequest(client, transport, "boundary-as-to", vehicle.externalDeviceId, iso(pointTime - 1_000), iso(pointTime), output);
    const right = await runRequest(client, transport, "boundary-as-from", vehicle.externalDeviceId, iso(pointTime), iso(pointTime + 1_000), output);
    const key = identity(boundary);
    boundaryResult = {
      pointAtToReturned: left.some((position) => identity(position) === key),
      pointAtFromReturned: right.some((position) => identity(position) === key),
    };
  }
  return {
    repeatIdentical: digest(oneHour) === digest(repeated),
    offsetEquivalent: output.find((item) => item.label === "one-hour")?.digest === output.find((item) => item.label === "one-hour-offset")?.digest,
    boundary: boundaryResult,
  };
}

function quantile(sorted, percentile) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(percentile * sorted.length) - 1)];
}

async function samplePlan(client, transport, vehicles, output) {
  const dailyCounts = [];
  for (const [index, vehicle] of vehicles.slice(0, 5).entries()) {
    const toMs = vehicle.currentState.fixTime.getTime() + 1_000;
    const positions = await runRequest(client, transport, `density-${index + 1}`, vehicle.externalDeviceId, iso(toMs - 24 * 60 * 60 * 1_000), iso(toMs), output);
    dailyCounts.push(positions.length);
  }

  const primary = vehicles[0];
  const anchor = primary.currentState.fixTime.getTime() + 1_000;
  for (const daysAgo of [7, 30, 60, 90]) {
    const toMs = anchor - daysAgo * 24 * 60 * 60 * 1_000;
    await runRequest(client, transport, `retention-${daysAgo}-days-ago`, primary.externalDeviceId, iso(toMs - 24 * 60 * 60 * 1_000), iso(toMs), output);
  }

  const sevenDays = await runRequest(client, transport, "seven-day-window", primary.externalDeviceId, iso(anchor - 7 * 24 * 60 * 60 * 1_000), iso(anchor), output);
  const sorted = [...dailyCounts].sort((left, right) => left - right);
  return {
    densitySampleVehicles: dailyCounts.length,
    pointsPerDay: { min: sorted[0] ?? null, p50: quantile(sorted, 0.5), p95: quantile(sorted, 0.95), p99: quantile(sorted, 0.99), max: sorted.at(-1) ?? null },
    sevenDayRows: sevenDays.length,
  };
}

async function partitionPlan(client, transport, vehicles, output) {
  const vehicle = vehicles[Math.min(1, vehicles.length - 1)];
  const toMs = vehicle.currentState.fixTime.getTime() + 1_000;
  const fromMs = toMs - 24 * 60 * 60 * 1_000;
  const full = await runRequest(client, transport, "partition-full-day", vehicle.externalDeviceId, iso(fromMs), iso(toMs), output);
  const parts = [];
  for (let index = 0; index < 4; index += 1) {
    const partFrom = fromMs + index * 6 * 60 * 60 * 1_000;
    const partTo = fromMs + (index + 1) * 6 * 60 * 60 * 1_000;
    parts.push(await runRequest(client, transport, `partition-six-hours-${index + 1}`, vehicle.externalDeviceId, iso(partFrom), iso(partTo), output));
  }
  const fullIdentities = new Set(full.map(identity));
  const partitionIdentities = new Set(parts.flat().map(identity));
  const missingFromParts = [...fullIdentities].filter((value) => !partitionIdentities.has(value)).length;
  const extraInParts = [...partitionIdentities].filter((value) => !fullIdentities.has(value)).length;

  const oneHourFrom = iso(toMs - 60 * 60 * 1_000);
  await runRequest(client, transport, "raw-id-repeat-a", vehicle.externalDeviceId, oneHourFrom, iso(toMs), output);
  await runRequest(client, transport, "raw-id-repeat-b", vehicle.externalDeviceId, oneHourFrom, iso(toMs), output);

  const primary = vehicles[0];
  const primaryToMs = primary.currentState.fixTime.getTime() + 1_000;
  const thirtyDays = await runRequest(client, transport, "thirty-day-window", primary.externalDeviceId, iso(primaryToMs - 30 * 24 * 60 * 60 * 1_000), iso(primaryToMs), output);
  const repeatA = output.find((item) => item.label === "raw-id-repeat-a");
  const repeatB = output.find((item) => item.label === "raw-id-repeat-b");
  return {
    fullRows: full.length,
    fullUniqueFixes: fullIdentities.size,
    partitionRowsIncludingBoundaryOverlap: parts.reduce((total, part) => total + part.length, 0),
    partitionUniqueFixes: partitionIdentities.size,
    missingFromParts,
    extraInParts,
    rawIdsStableAcrossRepeat: repeatA?.stableNumericIdDigest === repeatB?.stableNumericIdDigest,
    thirtyDayRows: thirtyDays.length,
  };
}

async function main() {
  let prisma;
  const output = [];
  const plan = parsePlan(process.argv.slice(2));
  require("./load-root-env.cjs").loadRootEnv();
  if (
    process.env.SYNC_SCHEDULER_ENABLED !== "false"
    || process.env.ALERT_INGESTION_ENABLED !== "false"
    || process.env.TELEGRAM_NOTIFICATIONS_ENABLED !== "false"
  ) throw new Error("controlled flags required");
  const { parseApiConfig } = require("../dist/config/api-config");
  const config = parseApiConfig(process.env);
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.database.url }) });
  activePrisma = prisma;
  const before = await prisma.vehiclePositionObservation.count();
  const vehicles = await prisma.vehicle.findMany({
    where: { disabled: false, currentState: { is: { fixTime: { not: null } } } },
    select: { externalDeviceId: true, currentState: { select: { fixTime: true, speedKph: true } } },
  });
  const usable = vehicles
    .filter((vehicle) => vehicle.currentState?.fixTime instanceof Date)
    .sort((left, right) => {
      const timeDifference = right.currentState.fixTime.getTime() - left.currentState.fixTime.getTime();
      if (timeDifference !== 0) return timeDifference;
      return (right.currentState.speedKph ?? -1) - (left.currentState.speedKph ?? -1);
    });
  if (usable.length === 0) throw new Error("no discovery candidates");

  const transport = new GuardedHistoricalTransport(config.equGps);
  const client = createOfficialEquGpsClient(config.equGps, transport);
  const findings = plan === "narrow"
    ? await narrowPlan(client, transport, usable[0], output)
    : plan === "sample"
      ? await samplePlan(client, transport, usable, output)
      : await partitionPlan(client, transport, usable, output);
  const after = await prisma.vehiclePositionObservation.count();
  if (after !== before) throw new Error("discovery changed history");

  console.log(JSON.stringify({
    success: true,
    plan,
    requests: transport.requests,
    rateLimits: transport.rateLimits,
    databaseHistoryBefore: before,
    databaseHistoryAfter: after,
    findings,
    responses: output,
    network: { devices: 0, latestPositions: 0, historicalPositions: transport.requests, routesNew: 0, telegram: 0, openFreeMap: 0, unexpected: 0 },
  }, null, 2));
}

main()
  .catch((error) => {
    console.log(JSON.stringify({ success: false, errorType: safeErrorType(error), status: Number.isInteger(error?.status) ? error.status : null }));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (activePrisma !== undefined) await activePrisma.$disconnect().catch(() => undefined);
  });
