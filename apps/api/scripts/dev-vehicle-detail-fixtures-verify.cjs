"use strict";

// Read-only acceptance verifier for the development fixture.  It starts an
// ephemeral local API instance and blocks every outbound fetch.
const http = require("node:http");
const crypto = require("node:crypto");
const { VEHICLES } = require("./dev-vehicle-detail-fixtures.cjs");
const { parseLocalDevelopmentDatabase } = require("./dev-vehicle-detail-fixtures-safety.cjs");
process.env.SYNC_SCHEDULER_ENABLED = "false";
process.env.ALERT_INGESTION_ENABLED = "false";
process.env.TELEGRAM_NOTIFICATIONS_ENABLED = "false";
process.env.TELEGRAM_PRODUCT_LINKING_ENABLED = "false";
process.env.TELEGRAM_PER_USER_NOTIFICATIONS_ENABLED = "false";
process.env.TELEGRAM_PER_USER_DISPATCH_ENABLED = "false";
require("./load-root-env.cjs").loadRootEnv();

function getJson(port, path, cookie) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: "127.0.0.1", port, path, headers: { Cookie: cookie }, timeout: 8_000 }, (response) => {
      const chunks = []; response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => { try { resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); } catch (error) { reject(error); } });
    });
    request.on("timeout", () => request.destroy(new Error("fixture verification timed out"))); request.on("error", reject);
  });
}
function query(path, range) { return `${path}?${new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() })}`; }
async function main() {
  parseLocalDevelopmentDatabase(process.env);
  const originalFetch = globalThis.fetch; let externalRequests = 0;
  globalThis.fetch = async () => { externalRequests += 1; throw new Error("fixture verifier blocked an external request"); };
  const { NestFactory } = require("@nestjs/core"); const { AppModule } = require("../dist/app.module");
  const app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix("api"); let verificationUserCreated = false;
  try {
    await app.listen(0, "127.0.0.1"); const address = app.getHttpServer().address(); if (!address || typeof address === "string") throw new Error("fixture verifier has no local HTTP address");
    const { DatabaseService } = require("../dist/modules/database/database.service"); const database = app.get(DatabaseService).getClient();
    const verificationUserId = "d3e0f001-5a11-4b9d-8f00-000000000099";
    if (await database.authUser.findUnique({ where: { id: verificationUserId }, select: { id: true } })) throw new Error("fixture verifier user identity collision");
    const token = crypto.randomBytes(32).toString("base64url");
    await database.authUser.create({ data: { id: verificationUserId, login: "DEMO FIXTURE VERIFY", normalizedLogin: "demo.fixture.verify", passwordHash: Buffer.alloc(32, 1), passwordSalt: Buffer.alloc(16, 1), passwordHashVersion: 1, role: "ADMIN", disabled: false, mustChangePassword: false, passwordChangedAt: new Date() } }); verificationUserCreated = true;
    await database.authSession.create({ data: { id: "d3e0f001-5a11-4b9d-8f00-000000000098", userId: verificationUserId, tokenHash: crypto.createHash("sha256").update(token).digest(), expiresAt: new Date(Date.now() + 60 * 60_000) } });
    const cookie = `taxi_session=${token}`;
    const id = VEHICLES[0].id; const now = new Date(); const exact = { from: new Date(now - 6 * 3_600_000), to: now }; const sampled = { from: new Date(now - 72 * 3_600_000), to: now };
    const [details, trips, track, overview, stale, noPosition, disabled] = await Promise.all([
      getJson(address.port, `/api/vehicles/${id}/details`, cookie),
      getJson(address.port, query(`/api/vehicles/${id}/trip-analysis`, exact), cookie),
      getJson(address.port, query(`/api/vehicles/${id}/track`, exact), cookie),
      getJson(address.port, query(`/api/vehicles/${id}/track/overview`, sampled), cookie),
      getJson(address.port, `/api/vehicles/${VEHICLES[1].id}/details`, cookie),
      getJson(address.port, `/api/vehicles/${VEHICLES[2].id}/details`, cookie),
      getJson(address.port, `/api/vehicles/${VEHICLES[3].id}/details`, cookie),
    ]);
    if (details.status !== 200 || details.body?.currentState?.freshness !== "FRESH" || details.body?.today === null || details.body?.activeAlerts?.length !== 2 || details.body?.recentEvents?.length < 6) throw new Error(`fixture details API response was not acceptance-ready (status=${details.status}, freshness=${details.body?.currentState?.freshness ?? "none"}, today=${details.body?.today === null ? "null" : "present"}, active=${details.body?.activeAlerts?.length ?? 0}, recent=${details.body?.recentEvents?.length ?? 0})`);
    if (trips.status !== 200 || trips.body?.summary?.tripCount < 2 || trips.body?.summary?.stopCount < 2 || trips.body?.summary?.gapCount < 1) throw new Error("fixture trip API response was not acceptance-ready");
    if (track.status !== 200 || track.body?.summary?.pointCount < 1 || !track.body?.points?.some((point) => point.valid === false || point.outdated === true)) throw new Error("fixture exact history API response was not acceptance-ready");
    if (overview.status !== 200 || overview.body?.summary?.sampled !== true || overview.body?.summary?.segmentCount < 2 || overview.body?.summary?.gapCount < 1 || overview.body?.summary?.qualityWarningCount < 1) throw new Error("fixture sampled history API response was not acceptance-ready");
    if (stale.status !== 200 || stale.body?.currentState?.freshness !== "STALE") throw new Error("fixture stale vehicle API response was not acceptance-ready");
    if (noPosition.status !== 200 || noPosition.body?.currentState !== null) throw new Error("fixture no-position vehicle API response was not acceptance-ready");
    if (disabled.status !== 200 || disabled.body?.vehicle?.name !== "DEMO DISABLED" || (await database.vehicle.findUnique({ where: { id: VEHICLES[3].id }, select: { disabled: true } }))?.disabled !== true) throw new Error("fixture disabled vehicle API response was not acceptance-ready");
    if (externalRequests !== 0) throw new Error("fixture verifier observed an external request");
    console.log(JSON.stringify({ details: { activeAlerts: details.body.activeAlerts.length, recentEvents: details.body.recentEvents.length, freshness: details.body.currentState.freshness, today: details.body.today.date }, trips: trips.body.summary, exactHistory: track.body.summary, sampledHistory: overview.body.summary, secondaryVehicles: { stale: stale.body.currentState.freshness, noPosition: noPosition.body.currentState, disabled: true }, externalRequests }));
  } finally {
    if (verificationUserCreated) {
      const { DatabaseService } = require("../dist/modules/database/database.service");
      await app.get(DatabaseService).getClient().authUser.delete({ where: { id: "d3e0f001-5a11-4b9d-8f00-000000000099" } }).catch(() => {});
    }
    await app.close(); globalThis.fetch = originalFetch;
  }
}
main().catch((error) => { console.error(`vehicle detail fixture verification failed: ${error instanceof Error ? error.message : "unknown"}`); process.exitCode = 1; });
