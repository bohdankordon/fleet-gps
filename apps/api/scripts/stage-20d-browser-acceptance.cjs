const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
require("reflect-metadata");

process.env.SYNC_SCHEDULER_ENABLED = "false";
process.env.ALERT_INGESTION_ENABLED = "false";
process.env.TELEGRAM_NOTIFICATIONS_ENABLED = "false";
process.env.POSITION_HISTORY_MAINTENANCE_ENABLED = "false";
process.env.POSITION_HISTORY_RETENTION_ENABLED = "false";

const { PrismaPg } = require("@prisma/adapter-pg");
const { NestFactory } = require("@nestjs/core");
const { PrismaClient, AuthRole } = require("../dist/generated/prisma/client");
const { AppModule } = require("../dist/app.module");
const { hashPassword } = require("../dist/modules/auth/password");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const protectedTables = [
  "audit_events", "vehicles", "vehicle_current_states", "daily_vehicle_stats",
  "vehicle_position_observations", "vehicle_position_backfill_checkpoints", "position_history_population_runs",
  "alert_evaluation_observations", "alert_events", "alert_event_confirmations", "alert_notification_outbox", "application_settings",
];
const fullTables = ["auth_users", "auth_user_permissions", "auth_sessions", ...protectedTables];
const ownedUserIds = [];
let api;
let helper;
let next;
let nextExit;
let externalRequests = 0;
const nativeFetch = global.fetch;

function isLoopback(input) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  return url.hostname === "127.0.0.1" || url.hostname === "localhost";
}

global.fetch = async (input, init) => {
  if (!isLoopback(input)) externalRequests += 1;
  return nativeFetch(input, init);
};

async function snapshot(tables) {
  const result = {};
  for (const table of tables) {
    const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::text AS count, md5(COALESCE(string_agg(to_jsonb(row_data)::text, E'\n' ORDER BY to_jsonb(row_data)::text), '')) AS digest FROM "${table}" AS row_data`);
    result[table] = rows[0];
  }
  return result;
}

async function cleanup() {
  if (ownedUserIds.length === 0) return;
  await prisma.authSession.deleteMany({ where: { userId: { in: ownedUserIds } } });
  await prisma.authUserPermission.deleteMany({ where: { userId: { in: ownedUserIds } } });
  await prisma.authUser.deleteMany({ where: { id: { in: ownedUserIds } } });
}

function listen(server, port) {
  return new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { const response = await fetch(url); if (response.status < 500) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Local Next server did not become ready");
}

function redirect(response, location, cookies = []) {
  response.writeHead(302, { "Set-Cookie": cookies, Location: location, "Cache-Control": "no-store" });
  response.end();
}

async function main() {
  await cleanup();
  const baseline = await snapshot(fullTables);
  const login = `stage20d-browser-${crypto.randomUUID()}`;
  const password = `${crypto.randomUUID()}-acceptance`;
  const material = await hashPassword(password);
  const admin = await prisma.authUser.create({ data: { login, normalizedLogin: login, role: AuthRole.ADMIN, disabled: false, mustChangePassword: false, passwordHashVersion: material.version, passwordSalt: new Uint8Array(material.salt), passwordHash: new Uint8Array(material.hash) } });
  ownedUserIds.push(admin.id);

  api = await NestFactory.create(AppModule, { logger: false });
  api.setGlobalPrefix("api");
  await api.listen(3100, "127.0.0.1");

  helper = http.createServer(async (request, response) => {
    if (request.url === "/clear") {
      redirect(response, "http://127.0.0.1:3101/login", ["taxi_locale=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax", "taxi_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax"]);
      return;
    }
    if (request.url === "/invalid-locale") {
      redirect(response, "http://127.0.0.1:3101/login", ["taxi_locale=invalid-stage20d; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax", "taxi_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax"]);
      return;
    }
    if (request.url === "/fixture-login") {
      const upstream = await fetch("http://127.0.0.1:3100/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login, password }) });
      if (!upstream.ok) { response.writeHead(502).end(); return; }
      const sessionCookie = upstream.headers.get("set-cookie");
      if (!sessionCookie) { response.writeHead(502).end(); return; }
      redirect(response, "http://127.0.0.1:3101/", [sessionCookie]);
      return;
    }
    response.writeHead(404).end();
  });
  await listen(helper, 3099);

  const root = path.resolve(__dirname, "../../..");
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  next = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", "3101"], { cwd: path.join(root, "apps", "web"), env: { ...process.env, API_INTERNAL_BASE_URL: "http://127.0.0.1:3100", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  nextExit = new Promise((resolve) => next.once("exit", resolve));
  next.stdout.on("data", (chunk) => process.stdout.write(chunk));
  next.stderr.on("data", (chunk) => process.stderr.write(chunk));
  await Promise.race([waitFor("http://127.0.0.1:3101/login"), nextExit.then(() => { throw new Error("Local Next server exited before acceptance"); })]);

  const beforeBrowser = await snapshot(protectedTables);
  process.stdout.write("STAGE20D_BROWSER_READY http://127.0.0.1:3099/clear\n");
  await new Promise((resolve, reject) => {
    const onData = () => { process.stdin.off("end", onEnd); resolve(); };
    const onEnd = () => { process.stdin.off("data", onData); reject(new Error("Browser acceptance control input closed")); };
    process.stdin.once("data", onData);
    process.stdin.once("end", onEnd);
  });
  process.stdin.pause();

  if (JSON.stringify(await snapshot(protectedTables)) !== JSON.stringify(beforeBrowser)) throw new Error("Locale/browser acceptance changed protected database state");
  if (externalRequests !== 0) throw new Error("Browser acceptance made an external application request");
  if (next) { next.kill(); await nextExit; }
  if (helper) await new Promise((resolve) => helper.close(resolve));
  if (api) await api.close();
  await cleanup();
  if (JSON.stringify(await snapshot(fullTables)) !== JSON.stringify(baseline)) throw new Error("Browser fixture cleanup did not restore baseline");
  process.stdout.write(`${JSON.stringify({ protectedTableCount: protectedTables.length, localeReadDigestsIdentical: true, auditEventsUnchanged: true, exactAuthFixtureCleanup: true, baselineRestored: true, externalRequests })}\n`);
}

main().catch(async (error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Browser acceptance failed"}\n`);
  try {
    if (next && next.exitCode === null) { next.kill(); await nextExit; }
    if (helper) helper.close();
    if (api) await api.close();
    await cleanup();
  } finally {
    global.fetch = nativeFetch;
    await prisma.$disconnect();
    process.exitCode = 1;
  }
}).then(async () => { global.fetch = nativeFetch; await prisma.$disconnect(); });
