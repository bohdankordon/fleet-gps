"use strict";

const http = require("node:http");

process.env.SYNC_SCHEDULER_ENABLED = "false";
process.env.ALERT_INGESTION_ENABLED = "false";
process.env.TELEGRAM_NOTIFICATIONS_ENABLED = "false";
require("./load-root-env.cjs").loadRootEnv();

const network = { eQuGPS: 0, telegram: 0, openFreeMap: 0, unexpected: 0 };
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const input = args[0];
  const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
  if (url.hostname.includes("equgps")) network.eQuGPS += 1;
  else if (url.hostname === "api.telegram.org") network.telegram += 1;
  else if (url.hostname.includes("openfreemap")) network.openFreeMap += 1;
  else network.unexpected += 1;
  return originalFetch(...args);
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
    request.on("timeout", () => request.destroy(new Error("Vehicle-details HTTP smoke timed out")));
    request.on("error", reject);
  });
}

async function counts(client) {
  const values = await Promise.all([
    client.vehicle.count(),
    client.vehicleCurrentState.count(),
    client.dailyVehicleStat.count(),
    client.alertEvaluationObservation.count(),
    client.alertEvent.count(),
    client.alertNotificationOutbox.count(),
  ]);
  return { vehicle: values[0], currentState: values[1], dailyVehicleStat: values[2], alertEvaluationObservation: values[3], alertEvent: values[4], alertNotificationOutbox: values[5] };
}

async function main() {
  const { NestFactory } = require("@nestjs/core");
  const { AppModule } = require("../dist/app.module");
  const { DatabaseService } = require("../dist/modules/database/database.service");
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api");
  try {
    const client = app.get(DatabaseService).getClient();
    const vehicle = await client.vehicle.findFirst({ orderBy: { id: "asc" }, select: { id: true } });
    if (!vehicle) throw new Error("Vehicle-details HTTP smoke requires one existing vehicle");
    const before = await counts(client);
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (typeof address !== "object" || address === null) throw new Error("Vehicle-details HTTP smoke has no TCP address");
    const result = await getJson(address.port, `/api/vehicles/${vehicle.id}/details`);
    const after = await counts(client);
    const body = result.body;
    if (result.status !== 200 || typeof body?.vehicle?.id !== "string" || typeof body?.vehicle?.name !== "string") throw new Error("Vehicle-details HTTP smoke did not return a vehicle 200 response");
    if (body.currentState !== null && (typeof body.currentState?.position?.latitude !== "number" || typeof body.currentState?.position?.longitude !== "number")) throw new Error("Vehicle-details HTTP smoke returned invalid currentState");
    if (body.today !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.today?.date))) throw new Error("Vehicle-details HTTP smoke returned invalid today");
    if (!Array.isArray(body.activeAlerts) || body.activeAlerts.length > 2 || !Array.isArray(body.recentEvents) || body.recentEvents.length > 10) throw new Error("Vehicle-details HTTP smoke returned unbounded alerts");
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Vehicle-details GET changed database row counts");
    if (Object.values(network).some((value) => value !== 0)) throw new Error("Vehicle-details HTTP smoke made an external request");
    console.log(JSON.stringify({
      httpStatus: result.status,
      vehiclePresent: true,
      currentStatePresent: body.currentState !== null,
      todayPresent: body.today !== null,
      activeAlertsCount: body.activeAlerts.length,
      recentEventsCount: body.recentEvents.length,
      databaseBefore: before,
      databaseAfter: after,
      network,
    }));
  } finally {
    await app.close();
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Vehicle-details HTTP smoke failed");
  process.exitCode = 1;
});
