"use strict";

const { createHash, randomUUID } = require("node:crypto");
const net = require("node:net");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { config } = require("dotenv");
const { Client } = require("pg");

const FIXTURE_NAME = "Taxi GPS MAP ALERT TEST";
const FIXTURE_EXTERNAL_ID = 2_147_000_000;

function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function freePort() { return new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const address = server.address(); const port = typeof address === "object" && address ? address.port : 0; server.close((error) => error ? reject(error) : resolve(port)); }); }); }
function startTrap(onRequest) { return new Promise((resolve, reject) => { const server = http.createServer((_, response) => { onRequest(); response.statusCode = 503; response.end(); }); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const address = server.address(); resolve({ server, port: typeof address === "object" && address ? address.port : 0 }); }); }); }
function close(server) { return new Promise((resolve) => { if (!server?.listening) return resolve(); server.close(() => resolve()); }); }
function stop(child) { return new Promise((resolve) => { if (!child || child.exitCode !== null) return resolve(); const timer = setTimeout(() => child.kill("SIGKILL"), 2_000); child.once("exit", () => { clearTimeout(timer); resolve(); }); child.kill("SIGTERM"); }); }
async function waitFor(url) { for (let attempt = 0; attempt < 40; attempt += 1) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error("service unavailable"); }

async function state(client) {
  const result = await client.query('SELECT (SELECT count(*) FROM "vehicles") vehicles, (SELECT count(*) FROM "vehicle_current_states") current_states, (SELECT count(*) FROM "alert_evaluation_observations") observations, (SELECT count(*) FROM "alert_events") events, (SELECT count(*) FROM "alert_events" WHERE "status" = \'OPEN\') open_events, (SELECT count(*) FROM "alert_event_confirmations") confirmations, (SELECT count(*) FROM "alert_notification_outbox") outbox');
  const row = result.rows[0];
  return { vehicles: Number(row.vehicles), currentStates: Number(row.current_states), observations: Number(row.observations), events: Number(row.events), openEvents: Number(row.open_events), confirmations: Number(row.confirmations), outbox: Number(row.outbox) };
}

async function createFixture(client, vehicleId, speedingId, inactivityId) {
  const existing = await client.query('SELECT count(*) AS count FROM "vehicles" WHERE "name" = $1 OR "external_device_id" = $2', [FIXTURE_NAME, FIXTURE_EXTERNAL_ID]);
  if (Number(existing.rows[0]?.count) !== 0) throw new Error("controlled fixture collision");
  const now = new Date();
  const speedingAt = new Date(now.getTime() - 120_000);
  const inactivityAt = new Date(now.getTime() - 60_000);
  await client.query("BEGIN");
  try {
    await client.query('INSERT INTO "vehicles" ("id", "external_device_id", "name", "disabled", "created_at", "updated_at") VALUES ($1, $2, $3, false, $4, $4)', [vehicleId, FIXTURE_EXTERNAL_ID, FIXTURE_NAME, now]);
    await client.query('INSERT INTO "vehicle_current_states" ("vehicle_id", "status", "fix_time", "latitude", "longitude", "speed_kph", "valid", "outdated", "fetched_at") VALUES ($1, \'ONLINE\', $2, $3, $4, 25, true, false, $2)', [vehicleId, now, 49.2331, 28.4682]);
    await client.query('INSERT INTO "alert_events" ("id", "vehicle_id", "type", "status", "confirmed_at", "last_observed_at", "dedupe_key", "active_key", "speed_zone", "confirmation_speed_kph", "last_speed_kph", "peak_speed_kph", "speed_threshold_kph", "created_at", "updated_at") VALUES ($1, $2, \'SPEEDING\', \'OPEN\', $3, $3, $4, $5, \'CITY\', 80, 80, 80, 60, $3, $3)', [speedingId, vehicleId, speedingAt, digest(`fixture-speeding-dedupe-${vehicleId}`), digest(`fixture-speeding-active-${vehicleId}`)]);
    await client.query('INSERT INTO "alert_events" ("id", "vehicle_id", "type", "status", "confirmed_at", "last_observed_at", "dedupe_key", "active_key", "confirmation_traveled_distance_meters", "last_traveled_distance_meters", "minimum_traveled_distance_meters", "distance_threshold_meters", "duration_threshold_minutes", "created_at", "updated_at") VALUES ($1, $2, \'INACTIVITY\', \'OPEN\', $3, $3, $4, $5, 10, 10, 10, 300, 60, $3, $3)', [inactivityId, vehicleId, inactivityAt, digest(`fixture-inactivity-dedupe-${vehicleId}`), digest(`fixture-inactivity-active-${vehicleId}`)]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function cleanupFixture(client, vehicleId) {
  await client.query("BEGIN");
  try {
    await client.query('DELETE FROM "alert_notification_outbox" WHERE "alert_event_id" IN (SELECT "id" FROM "alert_events" WHERE "vehicle_id" = $1)', [vehicleId]);
    await client.query('DELETE FROM "alert_event_confirmations" WHERE "event_id" IN (SELECT "id" FROM "alert_events" WHERE "vehicle_id" = $1)', [vehicleId]);
    await client.query('DELETE FROM "alert_events" WHERE "vehicle_id" = $1', [vehicleId]);
    await client.query('DELETE FROM "vehicle_current_states" WHERE "vehicle_id" = $1', [vehicleId]);
    await client.query('DELETE FROM "vehicles" WHERE "id" = $1 AND "name" = $2', [vehicleId, FIXTURE_NAME]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  config({ path: path.resolve(__dirname, "../../..", ".env"), quiet: true, override: false });
  if (!process.env.DATABASE_URL) throw new Error("configuration");
  const database = new Client({ connectionString: process.env.DATABASE_URL });
  const vehicleId = randomUUID(); const speedingId = randomUUID(); const inactivityId = randomUUID();
  let api; let web; let trap; let externalRequests = 0; let fixtureCreated = false; let fixtureCleaned = false;
  let nestStatus = 0; let bffStatus = 0; let mapStatus = 0; let fixtureAlerts = 0; let fixtureVisible = false; let ssrFixture = false;
  await database.connect();
  const before = await state(database);
  let after = before;
  try {
    await createFixture(database, vehicleId, speedingId, inactivityId); fixtureCreated = true;
    const during = await state(database);
    if (during.vehicles !== before.vehicles + 1 || during.currentStates !== before.currentStates + 1 || during.events !== before.events + 2 || during.openEvents !== before.openEvents + 2 || during.observations !== before.observations || during.confirmations !== before.confirmations || during.outbox !== before.outbox) throw new Error("fixture scope assertion");
    const apiPort = await freePort(); const webPort = await freePort(); trap = await startTrap(() => { externalRequests += 1; });
    const apiEnv = { ...process.env, HOST: "127.0.0.1", PORT: String(apiPort), SYNC_SCHEDULER_ENABLED: "false", ALERT_INGESTION_ENABLED: "false", TELEGRAM_NOTIFICATIONS_ENABLED: "false", EQUGPS_BASE_URL: `https://127.0.0.1:${trap.port}/api`, EQUGPS_WEB_BASE_URL: `https://127.0.0.1:${trap.port}` };
    api = spawn(process.execPath, [path.resolve(__dirname, "../../api/dist/main.js")], { env: apiEnv, stdio: "ignore" }); await waitFor(`http://127.0.0.1:${apiPort}/api/health`);
    web = spawn(process.execPath, [path.resolve(__dirname, "start-standalone.cjs")], { cwd: path.resolve(__dirname, ".."), env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(webPort), API_INTERNAL_BASE_URL: `http://127.0.0.1:${apiPort}` }, stdio: "ignore" }); await waitFor(`http://127.0.0.1:${webPort}/`);
    const nest = await fetch(`http://127.0.0.1:${apiPort}/api/alert-events/map`); nestStatus = nest.status; const nestBody = await nest.json();
    const bff = await fetch(`http://127.0.0.1:${webPort}/api/alert-events/map`); bffStatus = bff.status; const bffBody = await bff.json();
    const fleet = await (await fetch(`http://127.0.0.1:${webPort}/api/fleet/map`)).json();
    const map = await fetch(`http://127.0.0.1:${webPort}/map`); mapStatus = map.status; const html = await map.text();
    const projected = bffBody.vehicles?.find((entry) => entry.vehicle?.id === vehicleId); fixtureAlerts = projected?.alerts?.length ?? 0;
    fixtureVisible = fleet.vehicles?.some((entry) => entry.vehicle?.id === vehicleId) === true;
    ssrFixture = html.includes(FIXTURE_NAME) && html.includes("data-open-alert-summary") && html.includes("Активных событий");
    const safeKeys = JSON.stringify(Object.keys(projected ?? {}).sort()) === JSON.stringify(["alerts", "vehicle"]);
    if (nestStatus !== 200 || bffStatus !== 200 || mapStatus !== 200 || fixtureAlerts !== 2 || projected.alerts[0]?.type !== "SPEEDING" || projected.alerts[1]?.type !== "INACTIVITY" || !fixtureVisible || !ssrFixture || !safeKeys || nestBody.summary?.totalOpenAlerts !== before.openEvents + 2 || externalRequests !== 0) throw new Error("controlled UI assertion");
  } finally {
    await stop(web); await stop(api); await close(trap?.server);
    if (fixtureCreated) { await cleanupFixture(database, vehicleId); fixtureCleaned = true; }
    after = await state(database);
    await database.end();
  }
  if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error("database baseline was not restored");
  console.log(`Nest/BFF/map status: ${nestStatus}/${bffStatus}/${mapStatus}`);
  console.log(`controlled fixture alerts/visible/SSR: ${fixtureAlerts}/${fixtureVisible}/${ssrFixture}`);
  console.log(`controlled fixture created/cleaned: ${fixtureCreated}/${fixtureCleaned}`);
  console.log(`Vehicle before/after: ${before.vehicles}/${after.vehicles}`);
  console.log(`CurrentState before/after: ${before.currentStates}/${after.currentStates}`);
  console.log(`AlertEvaluationObservation before/after: ${before.observations}/${after.observations}`);
  console.log(`AlertEvent before/after: ${before.events}/${after.events}`);
  console.log(`OPEN AlertEvent before/after: ${before.openEvents}/${after.openEvents}`);
  console.log(`AlertEventConfirmation before/after: ${before.confirmations}/${after.confirmations}`);
  console.log(`Outbox before/after: ${before.outbox}/${after.outbox}`);
  console.log(`eQuGPS requests: ${externalRequests}`);
  console.log("Telegram requests: 0");
  console.log("OpenFreeMap requests: 0 (server smoke has no browser/WebGL)");
  console.log(`unexpected external requests: ${externalRequests}`);
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : "OPEN alert map smoke failed"); process.exitCode = 1; });
