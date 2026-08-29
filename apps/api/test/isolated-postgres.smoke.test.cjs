const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");
const {
  createTestPgClient,
  withTestPrisma,
} = require("../test-support/isolated-postgres.cjs");

const advisoryLockKey = 826_5434;

test("DB test process runs on Linux when using the container runner", () => {
  if (process.env.TEST_DATABASE_RUNNER === "linux") assert.equal(process.platform, "linux");
});

test("test database guard rejects a development-shaped URL before any action", () => {
  const result = spawnSync(process.execPath, ["scripts/assert-test-database-url.cjs"], {
    cwd: path.resolve(__dirname, ".."),
    env: { PATH: process.env.PATH, TEST_DATABASE: "1", DATABASE_URL: "postgresql://taxi_gps@127.0.0.1:5433/taxi_gps" },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /Refusing database action/);
});

test("rollback leaves disposable test data absent", async () => {
  const client = await createTestPgClient();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS "test_harness_disposable_records" ("id" TEXT PRIMARY KEY)');
    await client.query('TRUNCATE TABLE "test_harness_disposable_records"');
    await client.query("BEGIN");
    await client.query('INSERT INTO "test_harness_disposable_records" ("id") VALUES ($1)', ["rollback-probe"]);
    await client.query("ROLLBACK");
    const result = await client.query('SELECT count(*)::int AS count FROM "test_harness_disposable_records"');
    assert.equal(result.rows[0].count, 0);
  } finally {
    await client.end();
  }
});

test("two independent connections prove advisory-lock exclusion and release", async () => {
  const first = await createTestPgClient();
  const second = await createTestPgClient();
  try {
    assert.equal((await first.query("SELECT pg_try_advisory_lock($1) AS locked", [advisoryLockKey])).rows[0].locked, true);
    assert.equal((await second.query("SELECT pg_try_advisory_lock($1) AS locked", [advisoryLockKey])).rows[0].locked, false);
    assert.equal((await first.query("SELECT pg_advisory_unlock($1) AS unlocked", [advisoryLockKey])).rows[0].unlocked, true);
    assert.equal((await second.query("SELECT pg_try_advisory_lock($1) AS locked", [advisoryLockKey])).rows[0].locked, true);
    await second.query("SELECT pg_advisory_unlock($1)", [advisoryLockKey]);
  } finally {
    await Promise.all([first.end(), second.end()]);
  }
});

test("complete migrations expose expected schema through Prisma", async () => {
  await withTestPrisma(async (prisma) => {
    assert.equal(await prisma.applicationSettings.count(), 1);
    assert.equal(await prisma.authUser.count(), 0);
    assert.equal(await prisma.telegramConnection.count(), 0);
    assert.equal(await prisma.telegramLinkToken.count(), 0);
    assert.equal(await prisma.telegramWebhookReceipt.count(), 0);
  });
});
