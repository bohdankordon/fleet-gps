const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { once } = require("node:events");
const net = require("node:net");
const { spawn } = require("node:child_process");
const test = require("node:test");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("../dist/generated/prisma/client.js");
const { hashPassword } = require("../dist/modules/auth/password.js");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function snapshot(client) {
  const tables = await client.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename");
  const result = [];
  for (const { tablename } of tables) {
    const quoted = `"${String(tablename).replaceAll('"', '""')}"`;
    const [row] = await client.$queryRawUnsafe(`SELECT count(*)::text AS count, md5(COALESCE(string_agg(row_to_json(t)::text, '' ORDER BY row_to_json(t)::text), '')) AS digest FROM ${quoted} t`);
    result.push([tablename, row.count, row.digest]);
  }
  return result;
}

async function waitForApi(baseUrl, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error("Stage 21 API fixture failed to start.");
    try { const response = await fetch(`${baseUrl}/api/health`); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Stage 21 API fixture did not become healthy.");
}

function login(baseUrl, loginName, password) {
  return fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ login: loginName, password }) });
}

test("real HTTP limiter is bounded to auth behavior and disposable database state is restored", { timeout: 25_000 }, async () => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL is required");
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const blockedLogin = `stage21_block_${suffix}`;
  const successLogin = `stage21_success_${suffix}`;
  const missingLogin = `stage21_missing_${suffix}`;
  const password = "Stage 21 synthetic credential value";
  const userIds = [randomUUID(), randomUUID()];
  let child;
  let baseline;
  try {
    const activeRuns = await client.positionHistoryPopulationRun.count({ where: { status: { in: ["PENDING", "RUNNING"] } } });
    assert.equal(activeRuns, 0, "An active durable population run would make provider-safe acceptance impossible.");
    baseline = await snapshot(client);
    const [blockedMaterial, successMaterial] = await Promise.all([hashPassword(password), hashPassword(password)]);
    for (const [index, loginName, material] of [[0, blockedLogin, blockedMaterial], [1, successLogin, successMaterial]]) {
      await client.authUser.create({ data: { id: userIds[index], login: loginName, normalizedLogin: loginName, passwordHashVersion: material.version, passwordSalt: new Uint8Array(material.salt), passwordHash: new Uint8Array(material.hash), role: "USER", disabled: false, mustChangePassword: false } });
    }

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ["dist/main.js"], {
      cwd: __dirname + "/..",
      stdio: "ignore",
      env: {
        ...process.env,
        NODE_ENV: "test",
        HOST: "127.0.0.1",
        PORT: String(port),
        SYNC_SCHEDULER_ENABLED: "false",
        ALERT_INGESTION_ENABLED: "false",
        TELEGRAM_NOTIFICATIONS_ENABLED: "false",
        POSITION_HISTORY_MAINTENANCE_ENABLED: "false",
        POSITION_HISTORY_RETENTION_ENABLED: "false",
        EQUGPS_BASE_URL: "https://provider.invalid.test/api",
        EQUGPS_WEB_BASE_URL: "https://provider-web.invalid.test",
        EQUGPS_EMAIL: "synthetic@example.test",
        EQUGPS_PASSWORD: "synthetic-provider-secret",
      },
    });
    await waitForApi(baseUrl, child);

    const sessionsBeforeOversize = await client.authSession.count({ where: { userId: { in: userIds } } });
    const oversized = await login(baseUrl, successLogin, "x".repeat(150_000));
    assert.equal(oversized.status, 413);
    assert.equal(await client.authSession.count({ where: { userId: { in: userIds } } }), sessionsBeforeOversize);

    for (let attempt = 0; attempt < 5; attempt += 1) assert.equal((await login(baseUrl, blockedLogin, "wrong synthetic credential")).status, 401);
    const limited = await login(baseUrl, blockedLogin, password);
    assert.equal(limited.status, 429);
    const limitedBody = await limited.json();
    assert.deepEqual(limitedBody, { statusCode: 429, error: "LOGIN_RATE_LIMITED" });
    assert.equal(JSON.stringify(limitedBody).includes(blockedLogin), false);

    for (let attempt = 0; attempt < 5; attempt += 1) assert.equal((await login(baseUrl, missingLogin, "wrong synthetic credential")).status, 401);
    const missingLimited = await login(baseUrl, missingLogin, "wrong synthetic credential");
    assert.equal(missingLimited.status, 429);
    assert.deepEqual(await missingLimited.json(), limitedBody);

    for (let attempt = 0; attempt < 4; attempt += 1) assert.equal((await login(baseUrl, successLogin.toUpperCase(), "wrong synthetic credential")).status, 401);
    const success = await login(baseUrl, successLogin, password);
    assert.equal(success.status, 201);
    assert.match(success.headers.get("set-cookie") ?? "", /^taxi_session=.*HttpOnly.*SameSite=Lax.*Path=\//);
    assert.equal((await client.authUser.findUniqueOrThrow({ where: { id: userIds[0] }, select: { disabled: true } })).disabled, false);
    assert.equal((await client.authUser.findUniqueOrThrow({ where: { id: userIds[1] }, select: { disabled: true } })).disabled, false);
    assert.equal((await client.$queryRawUnsafe("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name ILIKE '%rate%limit%'"))[0].count, 0);
  } finally {
    if (child && child.exitCode === null) { child.kill(); await once(child, "exit").catch(() => undefined); }
    await client.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await client.authUserPermission.deleteMany({ where: { userId: { in: userIds } } });
    await client.authUser.deleteMany({ where: { id: { in: userIds } } });
    if (baseline) assert.deepEqual(await snapshot(client), baseline);
    await client.$disconnect();
  }
});
