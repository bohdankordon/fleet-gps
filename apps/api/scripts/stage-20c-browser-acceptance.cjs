const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
require("reflect-metadata");
process.env.SYNC_SCHEDULER_ENABLED = "false";
process.env.ALERT_INGESTION_ENABLED = "false";
process.env.POSITION_HISTORY_MAINTENANCE_ENABLED = "false";
process.env.POSITION_HISTORY_RETENTION_ENABLED = "false";
process.env.TELEGRAM_NOTIFICATIONS_ENABLED = "false";
const { PrismaPg } = require("@prisma/adapter-pg");
const { NestFactory } = require("@nestjs/core");
const { PrismaClient, AuditActorType, AuditEventType, AuditTargetType, AuthRole } = require("../dist/generated/prisma/client");
const { AppModule } = require("../dist/app.module");
const { hashSessionToken } = require("../dist/modules/auth/session");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const ownedUserIds = [];
const ownedAuditIds = [];
const protectedTables = ["auth_users", "auth_user_permissions", "auth_sessions", "audit_events", "vehicles", "vehicle_current_states", "daily_vehicle_stats", "vehicle_position_observations", "vehicle_position_backfill_checkpoints", "position_history_population_runs", "alert_evaluation_observations", "alert_events", "alert_event_confirmations", "alert_notification_outbox", "application_settings"];
let api;
let helper;
let next;
let nextExit;

async function snapshot() { const result = {}; for (const table of protectedTables) { const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::text AS count, md5(COALESCE(string_agg(to_jsonb(row_data)::text, E'\\n' ORDER BY to_jsonb(row_data)::text), '')) AS digest FROM "${table}" AS row_data`); result[table] = rows[0]; } return result; }
async function cleanup() { if (ownedAuditIds.length) await prisma.auditEvent.deleteMany({ where: { id: { in: ownedAuditIds } } }); if (ownedUserIds.length) { await prisma.authSession.deleteMany({ where: { userId: { in: ownedUserIds } } }); await prisma.authUserPermission.deleteMany({ where: { userId: { in: ownedUserIds } } }); await prisma.authUser.deleteMany({ where: { id: { in: ownedUserIds } } }); } }
function listen(server, port) { return new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); }); }
async function waitFor(url) { for (let attempt = 0; attempt < 120; attempt += 1) { try { const response = await fetch(url); if (response.status < 500) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error("Local Next server did not become ready"); }

async function main() {
  await cleanup();
  const baseline = await snapshot();
  const login = `stage20c-browser-${crypto.randomUUID()}`;
  const admin = await prisma.authUser.create({ data: { login, normalizedLogin: login, role: AuthRole.ADMIN, disabled: false, mustChangePassword: false, passwordHashVersion: 1, passwordSalt: crypto.randomBytes(16), passwordHash: crypto.randomBytes(32) } });
  ownedUserIds.push(admin.id);
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.authSession.create({ data: { userId: admin.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
  const base = new Date("2099-08-11T02:00:00.000Z");
  const rows = [];
  for (let index = 0; index < 55; index += 1) { const id = crypto.randomUUID(); ownedAuditIds.push(id); rows.push({ id, eventType: AuditEventType.USER_DISABLED, actorType: AuditActorType.USER, actorUserId: admin.id, actorLoginSnapshot: login, targetType: AuditTargetType.USER, targetId: admin.id, details: { targetLoginSnapshot: login }, createdAt: new Date(base.getTime() + index * 1000) }); }
  const systemId = crypto.randomUUID(); ownedAuditIds.push(systemId); rows.push({ id: systemId, eventType: AuditEventType.SYSTEM_POPULATION_CREATED, actorType: AuditActorType.SYSTEM, actorUserId: null, actorLoginSnapshot: null, targetType: AuditTargetType.POSITION_HISTORY_POPULATION_RUN, targetId: crypto.randomUUID(), details: { to: base.toISOString(), windowBudget: 5000, excludeProviderDisabled: true }, createdAt: new Date(base.getTime() + 70_000) });
  const malformedId = crypto.randomUUID(); ownedAuditIds.push(malformedId); rows.push({ id: malformedId, eventType: AuditEventType.USER_DISABLED, actorType: AuditActorType.USER, actorUserId: admin.id, actorLoginSnapshot: login, targetType: AuditTargetType.USER, targetId: admin.id, details: { targetLoginSnapshot: login, password: "stage20c-browser-forbidden-secret" }, createdAt: new Date(base.getTime() + 71_000) });
  await prisma.auditEvent.createMany({ data: rows });
  const beforeReads = await snapshot();

  api = await NestFactory.create(AppModule, { logger: false }); api.setGlobalPrefix("api"); await api.listen(3100, "127.0.0.1");
  helper = http.createServer((request, response) => { if (request.url !== "/fixture") { response.writeHead(404).end(); return; } response.writeHead(302, { "Set-Cookie": `taxi_session=${token}; HttpOnly; SameSite=Lax; Path=/`, Location: "http://127.0.0.1:3101/admin/audit", "Cache-Control": "no-store" }).end(); });
  await listen(helper, 3099);
  const root = path.resolve(__dirname, "../../..");
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  next = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", "3101"], { cwd: path.join(root, "apps", "web"), env: { ...process.env, API_INTERNAL_BASE_URL: "http://127.0.0.1:3100", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  nextExit = new Promise((resolve) => next.once("exit", resolve));
  next.stdout.on("data", (chunk) => process.stdout.write(chunk)); next.stderr.on("data", (chunk) => process.stderr.write(chunk));
  await Promise.race([waitFor("http://127.0.0.1:3101/login"), nextExit.then(() => { throw new Error("Local Next server exited before acceptance"); })]);
  process.stdout.write(`STAGE20C_BROWSER_READY http://127.0.0.1:3099/fixture\n`);
  await new Promise((resolve, reject) => {
    const onData = () => { process.stdin.off("end", onEnd); resolve(); };
    const onEnd = () => { process.stdin.off("data", onData); reject(new Error("Browser acceptance control input closed")); };
    process.stdin.once("data", onData);
    process.stdin.once("end", onEnd);
  });
  process.stdin.pause();
  const unchanged = JSON.stringify(await snapshot()) === JSON.stringify(beforeReads);
  if (!unchanged) throw new Error("Browser viewer changed protected database state");
  if (next) { next.kill(); await nextExit; }
  if (helper) await new Promise((resolve) => helper.close(resolve));
  if (api) await api.close();
  await cleanup();
  const restored = JSON.stringify(await snapshot()) === JSON.stringify(baseline);
  if (!restored) throw new Error("Browser fixture cleanup did not restore baseline");
  process.stdout.write(`${JSON.stringify({ browserFixtureRows: rows.length, browserViewerReadDigestsIdentical: true, exactFixtureCleanup: true, baselineRestored: true, externalRequests: 0 })}\n`);
}

main().catch(async (error) => { process.stderr.write(`${error instanceof Error ? error.message : "Browser acceptance failed"}\n`); try { if (next && next.exitCode === null) { next.kill(); await nextExit; } if (helper) helper.close(); if (api) await api.close(); await cleanup(); } finally { await prisma.$disconnect(); process.exitCode = 1; } }).then(async () => { await prisma.$disconnect(); });
