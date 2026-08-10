"use strict";

const crypto = require("node:crypto");
const http = require("node:http");

process.env.SYNC_SCHEDULER_ENABLED = "false";
process.env.ALERT_INGESTION_ENABLED = "false";
process.env.TELEGRAM_NOTIFICATIONS_ENABLED = "false";
require("./load-root-env.cjs").loadRootEnv();

const network = { devices: 0, latestPositions: 0, historicalPositions: 0, routesNew: 0, telegram: 0, openFreeMap: 0, unexpected: 0 };
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const input = args[0];
  const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
  if (url.pathname.endsWith("/devices/routes-new")) network.routesNew += 1;
  else if (url.hostname === "api.telegram.org") network.telegram += 1;
  else if (url.hostname.includes("openfreemap")) network.openFreeMap += 1;
  else if (url.pathname.endsWith("/devices")) network.devices += 1;
  else if (url.pathname.endsWith("/positions") && url.search) network.historicalPositions += 1;
  else if (url.pathname.endsWith("/positions")) network.latestPositions += 1;
  else network.unexpected += 1;
  throw new Error("Vehicle-track HTTP smoke blocked an external request");
};

function getJson(port, path) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: "127.0.0.1", port, path, timeout: 5_000 }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try { resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); }
        catch (error) { reject(error); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("Vehicle-track HTTP smoke timed out")));
    request.on("error", reject);
  });
}

async function databaseSnapshot(client) {
  const queries = [
    client.vehicle.findMany({ orderBy: { id: "asc" } }),
    client.vehicleCurrentState.findMany({ orderBy: { vehicleId: "asc" } }),
    client.dailyVehicleStat.findMany({ orderBy: { id: "asc" } }),
    client.vehiclePositionObservation.findMany({ orderBy: { id: "asc" } }),
    client.vehiclePositionBackfillCheckpoint.findMany({ orderBy: { id: "asc" } }),
    client.alertEvaluationObservation.findMany({ orderBy: { id: "asc" } }),
    client.alertEvent.findMany({ orderBy: { id: "asc" } }),
    client.alertNotificationOutbox.findMany({ orderBy: { id: "asc" } }),
  ];
  const rows = await Promise.all(queries);
  return {
    counts: { vehicle: rows[0].length, currentState: rows[1].length, dailyVehicleStat: rows[2].length, vehiclePositionObservation: rows[3].length, vehiclePositionBackfillCheckpoint: rows[4].length, alertEvaluationObservation: rows[5].length, alertEvent: rows[6].length, outbox: rows[7].length },
    digest: crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
  };
}

function assertTrackResponse(result, expectedCountKind) {
  const body = result.body;
  if (result.status !== 200 || !Array.isArray(body?.points) || body.summary?.pointCount !== body.points.length || body.points.length > 10_000) throw new Error("Vehicle-track HTTP smoke received an invalid 200 contract");
  if (expectedCountKind === "non-empty" && body.points.length < 1) throw new Error("Vehicle-track HTTP smoke expected persisted points");
  if (expectedCountKind === "empty" && (body.points.length !== 0 || body.summary.firstObservedAt !== null || body.summary.lastObservedAt !== null)) throw new Error("Vehicle-track HTTP smoke expected an empty track");
  for (let index = 1; index < body.points.length; index += 1) if (body.points[index - 1].observedAt > body.points[index].observedAt) throw new Error("Vehicle-track HTTP smoke received unordered points");
  if (body.points.length > 0 && (body.summary.firstObservedAt !== body.points[0].observedAt || body.summary.lastObservedAt !== body.points.at(-1).observedAt)) throw new Error("Vehicle-track HTTP smoke received an invalid summary");
  for (const point of body.points) if (Object.keys(point).sort().join(",") !== ["latitude", "longitude", "observedAt", "outdated", "speedKph", "valid"].sort().join(",")) throw new Error("Vehicle-track HTTP smoke exposed an unsafe point field");
}

async function main() {
  const { NestFactory } = require("@nestjs/core");
  const { AppModule } = require("../dist/app.module");
  const { DatabaseService } = require("../dist/modules/database/database.service");
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api");
  try {
    const client = app.get(DatabaseService).getClient();
    const observation = await client.vehiclePositionObservation.findFirst({ orderBy: [{ observedAt: "asc" }, { fixFingerprint: "asc" }], select: { vehicleId: true, observedAt: true } });
    if (!observation) throw new Error("Vehicle-track HTTP smoke requires permanent history");
    const before = await databaseSnapshot(client);
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (typeof address !== "object" || address === null) throw new Error("Vehicle-track HTTP smoke has no TCP address");
    const from = observation.observedAt.toISOString();
    const to = new Date(observation.observedAt.getTime() + 60 * 60 * 1_000).toISOString();
    const encodedRange = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const nonEmpty = await getJson(address.port, `/api/vehicles/${observation.vehicleId}/track?${encodedRange}`);
    assertTrackResponse(nonEmpty, "non-empty");
    if (nonEmpty.body.range.from !== from || nonEmpty.body.range.to !== to) throw new Error("Vehicle-track HTTP smoke range echo differs");
    const empty = await getJson(address.port, `/api/vehicles/${observation.vehicleId}/track?from=2100-01-01T00%3A00%3A00Z&to=2100-01-01T01%3A00%3A00Z`);
    assertTrackResponse(empty, "empty");
    const unknown = await getJson(address.port, `/api/vehicles/00000000-0000-4000-8000-ffffffffffff/track?${encodedRange}`);
    const malformed = await getJson(address.port, `/api/vehicles/not-a-uuid/track?${encodedRange}`);
    if (unknown.status !== 404 || malformed.status !== 400) throw new Error("Vehicle-track HTTP smoke expected safe 404 and 400");
    const after = await databaseSnapshot(client);
    if (JSON.stringify(before.counts) !== JSON.stringify(after.counts) || before.digest !== after.digest) throw new Error("Vehicle-track GET changed database state");
    if (Object.values(network).some((value) => value !== 0)) throw new Error("Vehicle-track HTTP smoke observed an external request");
    console.log(JSON.stringify({
      nonEmpty: { httpStatus: nonEmpty.status, pointCount: nonEmpty.body.summary.pointCount, chronological: true, summaryValid: true, rangeEchoed: true },
      empty: { httpStatus: empty.status, pointCount: empty.body.summary.pointCount },
      unknownStatus: unknown.status,
      malformedStatus: malformed.status,
      databaseBefore: before.counts,
      databaseAfter: after.counts,
      databaseDigestsUnchanged: true,
      network,
    }));
  } finally {
    await app.close();
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Vehicle-track HTTP smoke failed");
  process.exitCode = 1;
});
