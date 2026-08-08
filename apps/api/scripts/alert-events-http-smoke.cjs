"use strict";

const http = require("node:http");

process.env.SYNC_SCHEDULER_ENABLED = "false";
process.env.ALERT_INGESTION_ENABLED = "false";
process.env.TELEGRAM_NOTIFICATIONS_ENABLED = "false";

let externalHttpRequests = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  externalHttpRequests += 1;
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
    request.on("timeout", () => request.destroy(new Error("Alert-events HTTP smoke timed out")));
    request.on("error", reject);
  });
}

async function main() {
  const { NestFactory } = require("@nestjs/core");
  const { AppModule } = require("../dist/app.module");
  const { DatabaseService } = require("../dist/modules/database/database.service");
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api");
  let before;
  try {
    const client = app.get(DatabaseService).getClient();
    before = await Promise.all([client.alertEvent.count(), client.alertNotificationOutbox.count()]);
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (typeof address !== "object" || address === null) throw new Error("Alert-events HTTP smoke has no TCP address");
    const list = await getJson(address.port, "/api/alert-events");
    const summary = await getJson(address.port, "/api/alert-events/summary");
    const after = await Promise.all([client.alertEvent.count(), client.alertNotificationOutbox.count()]);
    if (list.status !== 200 || !Array.isArray(list.body?.items) || list.body.items.length !== 0 || list.body.nextCursor !== null) throw new Error("Alert-events list is not the expected empty 200 response");
    if (summary.status !== 200 || summary.body?.open?.total !== 0 || summary.body.open.speeding !== 0 || summary.body.open.inactivity !== 0) throw new Error("Alert-events summary is not the expected empty 200 response");
    if (before[0] !== 0 || before[1] !== 0 || after[0] !== before[0] || after[1] !== before[1]) throw new Error("Alert-events HTTP smoke requires an unchanged empty AlertEvent/outbox database");
    if (externalHttpRequests !== 0) throw new Error("Alert-events HTTP smoke made an unexpected external HTTP request");
    console.log(JSON.stringify({ listStatus: list.status, listItems: list.body.items.length, nextCursor: list.body.nextCursor, summaryStatus: summary.status, openTotal: summary.body.open.total, alertEventsBefore: before[0], alertEventsAfter: after[0], outboxBefore: before[1], outboxAfter: after[1], externalHttpRequests }));
  } finally {
    await app.close();
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Alert-events HTTP smoke failed");
  process.exitCode = 1;
});
