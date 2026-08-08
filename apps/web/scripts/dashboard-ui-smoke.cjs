const net = require("node:net");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { config } = require("dotenv");
const { Client } = require("pg");

function freePort() { return new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const address = server.address(); const port = typeof address === "object" && address ? address.port : 0; server.close((error) => error ? reject(error) : resolve(port)); }); }); }
function startTrap(onRequest) { return new Promise((resolve, reject) => { const server = http.createServer((_, response) => { onRequest(); response.statusCode = 503; response.end(); }); server.on("clientError", onRequest); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const address = server.address(); resolve({ server, port: typeof address === "object" && address ? address.port : 0 }); }); }); }
function close(server) { return new Promise((resolve) => { if (!server || !server.listening) return resolve(); server.close(() => resolve()); }); }
async function waitFor(url) { for (let attempt = 0; attempt < 40; attempt += 1) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error("service unavailable"); }
function stop(child) { return new Promise((resolve) => { if (!child || child.exitCode !== null) return resolve(); const timer = setTimeout(() => child.kill("SIGKILL"), 2_000); child.once("exit", () => { clearTimeout(timer); resolve(); }); child.kill("SIGTERM"); }); }
async function alertCounts(client) { const result = await client.query('SELECT (SELECT count(*) FROM "alert_events") AS "events", (SELECT count(*) FROM "alert_notification_outbox") AS "outbox"'); return { events: Number(result.rows[0]?.events ?? Number.NaN), outbox: Number(result.rows[0]?.outbox ?? Number.NaN) }; }

async function main() {
  let api; let web; let trap; let database; let apiClosed = false; let webClosed = false; let dashboardStatus = 0; let eventsStatus = 0; let dashboardBffStatus = 0; let eventsBffStatus = 0; let summaryBffStatus = 0; let eventsTitle = false; let eventsEmpty = false; let externalRequests = 0; let before = { events: Number.NaN, outbox: Number.NaN }; let after = { events: Number.NaN, outbox: Number.NaN };
  config({ path: path.resolve(__dirname, "../../..", ".env"), quiet: true, override: false });
  try {
    if (!process.env.DATABASE_URL) throw new Error("configuration");
    database = new Client({ connectionString: process.env.DATABASE_URL }); await database.connect(); before = await alertCounts(database);
    const apiPort = await freePort(); const webPort = await freePort(); trap = await startTrap(() => { externalRequests += 1; });
    const apiEnv = { ...process.env, HOST: "127.0.0.1", PORT: String(apiPort), SYNC_SCHEDULER_ENABLED: "false", ALERT_INGESTION_ENABLED: "false", TELEGRAM_NOTIFICATIONS_ENABLED: "false", EQUGPS_BASE_URL: `https://127.0.0.1:${trap.port}/api`, EQUGPS_WEB_BASE_URL: `https://127.0.0.1:${trap.port}`, EQUGPS_EMAIL: "smoke@example.test", EQUGPS_PASSWORD: "smoke-password", EQUGPS_REQUEST_TIMEOUT_MS: "15000", EQUGPS_RUNS_TIMEOUT_MS: "45000" };
    api = spawn(process.execPath, [path.resolve(__dirname, "../../api/dist/main.js")], { env: apiEnv, stdio: "ignore" }); await waitFor(`http://127.0.0.1:${apiPort}/api/health`);
    web = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(webPort), "-H", "127.0.0.1"], { cwd: path.resolve(__dirname, ".."), env: { ...process.env, API_INTERNAL_BASE_URL: `http://127.0.0.1:${apiPort}` }, stdio: "ignore" }); await waitFor(`http://127.0.0.1:${webPort}/`);
    const dashboard = await fetch(`http://127.0.0.1:${webPort}/`); dashboardStatus = dashboard.status;
    const events = await fetch(`http://127.0.0.1:${webPort}/events`); eventsStatus = events.status; const eventsHtml = await events.text(); eventsTitle = eventsHtml.includes("События"); eventsEmpty = eventsHtml.includes("Событий пока нет");
    const dashboardBff = await fetch(`http://127.0.0.1:${webPort}/api/dashboard/vehicles`); dashboardBffStatus = dashboardBff.status;
    const eventsBff = await fetch(`http://127.0.0.1:${webPort}/api/alert-events?limit=25`); eventsBffStatus = eventsBff.status; const eventsBody = await eventsBff.json();
    const summaryBff = await fetch(`http://127.0.0.1:${webPort}/api/alert-events/summary`); summaryBffStatus = summaryBff.status; const summaryBody = await summaryBff.json(); after = await alertCounts(database);
    if (dashboardStatus !== 200 || eventsStatus !== 200 || !eventsTitle || !eventsEmpty || dashboardBffStatus !== 200 || eventsBffStatus !== 200 || summaryBffStatus !== 200 || !Array.isArray(eventsBody?.items) || eventsBody.items.length !== 0 || eventsBody?.nextCursor !== null || summaryBody?.open?.total !== 0 || summaryBody.open.speeding !== 0 || summaryBody.open.inactivity !== 0 || before.events !== 0 || before.outbox !== 0 || after.events !== before.events || after.outbox !== before.outbox || externalRequests !== 0) throw new Error("smoke assertion");
  } catch { process.exitCode = 1; }
  finally { await stop(web); webClosed = true; await stop(api); apiClosed = true; await close(trap?.server); if (database) await database.end(); console.log(`dashboard status: ${dashboardStatus}`); console.log(`events status: ${eventsStatus}`); console.log(`events title present: ${eventsTitle}`); console.log(`events empty state present: ${eventsEmpty}`); console.log(`dashboard BFF status: ${dashboardBffStatus}`); console.log(`alert-events BFF status: ${eventsBffStatus}`); console.log(`alert-events summary BFF status: ${summaryBffStatus}`); console.log(`AlertEvent before/after: ${before.events}/${after.events}`); console.log(`Outbox before/after: ${before.outbox}/${after.outbox}`); console.log(`external requests: ${externalRequests}`); console.log(`API closed: ${apiClosed}`); console.log(`web closed: ${webClosed}`); }
}

void main().catch(() => { process.exitCode = 1; });
