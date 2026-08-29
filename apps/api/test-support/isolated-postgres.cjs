const { Client } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
// The test launcher builds immediately before loading this helper. Prisma's
// configured generated client is TypeScript source, so CJS integration tests
// deliberately consume its compiled counterpart.
const { PrismaClient } = require("../dist/generated/prisma/client");
const { assertIsolatedTestDatabaseUrl } = require("../scripts/assert-isolated-test-database-url.cjs");

function testDatabaseUrl(env = process.env) {
  return assertIsolatedTestDatabaseUrl(env).toString();
}

async function createTestPgClient(env = process.env) {
  const client = new Client({ connectionString: testDatabaseUrl(env) });
  await client.connect();
  return client;
}

function createTestPrismaClient(env = process.env) {
  const connectionString = testDatabaseUrl(env);
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 4 }) });
}

async function withTestPrisma(run, env = process.env) {
  const prisma = createTestPrismaClient(env);
  try { return await run(prisma); } finally { await prisma.$disconnect(); }
}

async function withTestTransaction(run, env = process.env) {
  return withTestPrisma((prisma) => prisma.$transaction((transaction) => run(transaction)), env);
}

async function resetTestDatabase(client, env = process.env) {
  assertIsolatedTestDatabaseUrl(env);
  const tables = await client.query(`
    SELECT quote_ident(table_schema) || '.' || quote_ident(table_name) AS qualified_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
    ORDER BY table_name
  `);
  if (tables.rows.length > 0) {
    await client.query(`TRUNCATE TABLE ${tables.rows.map((row) => row.qualified_name).join(", ")} RESTART IDENTITY CASCADE`);
  }
}

module.exports = {
  createTestPgClient,
  createTestPrismaClient,
  resetTestDatabase,
  testDatabaseUrl,
  withTestPrisma,
  withTestTransaction,
};
