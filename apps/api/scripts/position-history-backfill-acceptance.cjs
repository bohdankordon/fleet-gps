const crypto = require("node:crypto");
const { PositionIngestionSource } = require("../dist/generated/prisma/client");
const { classifyRequest, isAllowedHistoricalRequest } = require("./position-history-backfill.cjs");

async function counts(prisma) {
  const [vehicles, currentStates, dailyStats, alertObservations, alertEvents, outbox, positionHistory, checkpoints] = await Promise.all([
    prisma.vehicle.count(),
    prisma.vehicleCurrentState.count(),
    prisma.dailyVehicleStat.count(),
    prisma.alertEvaluationObservation.count(),
    prisma.alertEvent.count(),
    prisma.alertNotificationOutbox.count(),
    prisma.vehiclePositionObservation.count(),
    prisma.vehiclePositionBackfillCheckpoint.count(),
  ]);
  return { vehicles, currentStates, dailyStats, alertObservations, alertEvents, outbox, positionHistory, checkpoints };
}

async function currentStateDigest(prisma) {
  const rows = await prisma.vehicleCurrentState.findMany({
    orderBy: { vehicleId: "asc" },
    select: { vehicleId: true, status: true, externalLastUpdateAt: true, fixTime: true, latitude: true, longitude: true, speedKph: true, valid: true, outdated: true, fetchedAt: true },
  });
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function networkDelta(before, after) {
  return Object.fromEntries(Object.keys(after).map((key) => [key, after[key] - before[key]]));
}

function copyNetwork(network) { return { ...network }; }

function assertRun(result, delta, expectedCompleted) {
  if (
    result.completed !== expectedCompleted
    || result.historyCandidates !== result.historyInserted + result.historyDuplicates
    || delta.historicalPositions !== result.requests
    || Object.entries(delta).some(([key, count]) => key !== "historicalPositions" && count !== 0)
  ) throw new Error("acceptance assertion");
}

async function historyInvariants(prisma) {
  const [bySource, distinctVehicles, span, duplicateGroups, sameTimeDistinctFixGroups, invalidCoordinates, invalidSpeed] = await Promise.all([
    prisma.vehiclePositionObservation.groupBy({ by: ["ingestionSource"], _count: { _all: true } }),
    prisma.vehiclePositionObservation.findMany({ distinct: ["vehicleId"], select: { vehicleId: true } }),
    prisma.vehiclePositionObservation.aggregate({ _min: { observedAt: true }, _max: { observedAt: true } }),
    prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM (SELECT vehicle_id, fix_fingerprint FROM vehicle_position_observations GROUP BY vehicle_id, fix_fingerprint HAVING COUNT(*) > 1) duplicate_groups'),
    prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM (SELECT vehicle_id, observed_at FROM vehicle_position_observations GROUP BY vehicle_id, observed_at HAVING COUNT(DISTINCT fix_fingerprint) > 1) same_time_groups'),
    prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM vehicle_position_observations WHERE NOT (latitude BETWEEN -90 AND 90 AND latitude > \'-Infinity\'::double precision AND latitude < \'Infinity\'::double precision AND longitude BETWEEN -180 AND 180 AND longitude > \'-Infinity\'::double precision AND longitude < \'Infinity\'::double precision)'),
    prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM vehicle_position_observations WHERE speed_kph IS NOT NULL AND NOT (speed_kph >= 0 AND speed_kph > \'-Infinity\'::double precision AND speed_kph < \'Infinity\'::double precision)'),
  ]);
  const countOf = (rows) => Number(rows[0]?.count ?? -1);
  return {
    bySource: Object.fromEntries(bySource.map((row) => [row.ingestionSource, row._count._all])),
    vehiclesWithHistory: distinctVehicles.length,
    minObservedAt: span._min.observedAt?.toISOString() ?? null,
    maxObservedAt: span._max.observedAt?.toISOString() ?? null,
    duplicateIdentityGroups: countOf(duplicateGroups),
    sameTimeDistinctFixGroups: countOf(sameTimeDistinctFixGroups),
    invalidCoordinateRows: countOf(invalidCoordinates),
    invalidSpeedRows: countOf(invalidSpeed),
  };
}

function safeResult(result) {
  return {
    alreadyCompleted: result.alreadyCompleted,
    resumed: result.resumed,
    requests: result.requests,
    providerRows: result.providerRows,
    historyCandidates: result.historyCandidates,
    historyInserted: result.historyInserted,
    historyDuplicates: result.historyDuplicates,
    historySkippedInvalid: result.historySkippedInvalid,
    windowsCompleted: result.windowsCompleted,
    retries: result.retries,
    rateLimitResponses: result.rateLimitResponses,
    completed: result.completed,
  };
}

async function main() {
  let app;
  let prisma;
  const nativeFetch = global.fetch;
  const network = { devices: 0, latestPositions: 0, historicalPositions: 0, routesNew: 0, telegram: 0, openFreeMap: 0, unexpected: 0 };
  require("./load-root-env.cjs").loadRootEnv();
  process.env.SYNC_SCHEDULER_ENABLED = "false";
  process.env.ALERT_INGESTION_ENABLED = "false";
  process.env.TELEGRAM_NOTIFICATIONS_ENABLED = "false";
  global.fetch = async (input, init) => {
    const value = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    let kind = classifyRequest(value);
    if (kind === "historicalPositions" && !isAllowedHistoricalRequest(value, process.env.EQUGPS_BASE_URL)) kind = "unexpected";
    network[kind] += 1;
    if (kind !== "historicalPositions") throw new Error("Unexpected external request");
    return nativeFetch(input, init);
  };
  try {
    const { NestFactory } = require("@nestjs/core");
    const { PositionHistoryBackfillModule, PositionHistoryBackfillService } = require("../dist/modules/position-history-backfill");
    const { DatabaseService } = require("../dist/modules/database/database.service");
    app = await NestFactory.createApplicationContext(PositionHistoryBackfillModule, { logger: false, abortOnError: false });
    const service = app.get(PositionHistoryBackfillService);
    prisma = app.get(DatabaseService).getClient();
    const before = await counts(prisma);
    const stateBefore = await currentStateDigest(prisma);
    const anchor = await prisma.vehiclePositionObservation.findFirst({ where: { ingestionSource: PositionIngestionSource.FLEET_SYNC }, orderBy: [{ observedAt: "desc" }, { fixFingerprint: "asc" }], select: { vehicleId: true, observedAt: true } });
    if (anchor === null) throw new Error("acceptance baseline missing");
    const hour = 60 * 60 * 1_000;
    const mainTarget = { vehicleId: anchor.vehicleId, from: new Date(anchor.observedAt.getTime() - 2 * hour), to: anchor.observedAt };
    const resumeTarget = { vehicleId: anchor.vehicleId, from: new Date(anchor.observedAt.getTime() - 4 * hour), to: new Date(anchor.observedAt.getTime() - 2 * hour) };

    let networkBefore = copyNetwork(network);
    const firstHistoryBefore = await prisma.vehiclePositionObservation.count();
    const first = await service.run(mainTarget);
    const firstNetwork = networkDelta(networkBefore, network);
    const firstHistoryAfter = await prisma.vehiclePositionObservation.count();
    assertRun(first, firstNetwork, true);
    if (firstHistoryAfter - firstHistoryBefore !== first.historyInserted || first.historyInserted < 1) throw new Error("first run assertion");

    networkBefore = copyNetwork(network);
    const repeatedHistoryBefore = await prisma.vehiclePositionObservation.count();
    const repeated = await service.run(mainTarget);
    const repeatedNetwork = networkDelta(networkBefore, network);
    const repeatedHistoryAfter = await prisma.vehiclePositionObservation.count();
    assertRun(repeated, repeatedNetwork, true);
    if (!repeated.alreadyCompleted || repeated.requests !== 0 || repeatedHistoryAfter !== repeatedHistoryBefore) throw new Error("repeat assertion");

    networkBefore = copyNetwork(network);
    const pausedHistoryBefore = await prisma.vehiclePositionObservation.count();
    const paused = await service.run(resumeTarget, { maxWindows: 1 });
    const pausedNetwork = networkDelta(networkBefore, network);
    const pausedHistoryAfter = await prisma.vehiclePositionObservation.count();
    assertRun(paused, pausedNetwork, false);
    if (paused.windowsCompleted !== 1 || pausedHistoryAfter - pausedHistoryBefore !== paused.historyInserted) throw new Error("pause assertion");

    networkBefore = copyNetwork(network);
    const resumedHistoryBefore = await prisma.vehiclePositionObservation.count();
    const resumed = await service.run(resumeTarget);
    const resumedNetwork = networkDelta(networkBefore, network);
    const resumedHistoryAfter = await prisma.vehiclePositionObservation.count();
    assertRun(resumed, resumedNetwork, true);
    if (!resumed.resumed || resumedHistoryAfter - resumedHistoryBefore !== resumed.historyInserted) throw new Error("resume assertion");

    const final = await counts(prisma);
    const stateAfter = await currentStateDigest(prisma);
    const expectedHistoryGrowth = first.historyInserted + paused.historyInserted + resumed.historyInserted;
    if (
      final.positionHistory - before.positionHistory !== expectedHistoryGrowth
      || final.vehicles !== before.vehicles
      || final.currentStates !== before.currentStates
      || final.dailyStats !== before.dailyStats
      || final.alertObservations !== before.alertObservations
      || final.alertEvents !== before.alertEvents
      || final.outbox !== before.outbox
      || stateAfter !== stateBefore
    ) throw new Error("database invariant assertion");
    const invariants = await historyInvariants(prisma);
    if (invariants.duplicateIdentityGroups !== 0 || invariants.invalidCoordinateRows !== 0 || invariants.invalidSpeedRows !== 0) throw new Error("history invariant assertion");

    console.log(JSON.stringify({
      success: true,
      first: { ...safeResult(first), historyBefore: firstHistoryBefore, historyAfter: firstHistoryAfter, network: firstNetwork },
      repeated: { ...safeResult(repeated), historyBefore: repeatedHistoryBefore, historyAfter: repeatedHistoryAfter, network: repeatedNetwork },
      paused: { ...safeResult(paused), historyBefore: pausedHistoryBefore, historyAfter: pausedHistoryAfter, network: pausedNetwork },
      resumed: { ...safeResult(resumed), historyBefore: resumedHistoryBefore, historyAfter: resumedHistoryAfter, network: resumedNetwork },
      databaseBefore: before,
      databaseFinal: final,
      currentStateDataUnchanged: stateAfter === stateBefore,
      history: invariants,
      totalNetwork: network,
    }, null, 2));
  } finally {
    if (app !== undefined) await app.close().catch(() => undefined);
    global.fetch = nativeFetch;
  }
}

main().catch((error) => {
  console.log(JSON.stringify({ success: false, errorType: error?.name?.startsWith("EquGps") ? "provider" : error?.name?.startsWith("Prisma") ? "database" : "assertion" }));
  process.exitCode = 1;
});
