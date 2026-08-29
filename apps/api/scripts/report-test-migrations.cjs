const { Client } = require("pg");
const { assertContainerTestDatabaseUrl } = require("./assert-container-test-database-url.cjs");

async function main() {
  const url = assertContainerTestDatabaseUrl();
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const migrations = await client.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at, migration_name');
    const expectedTables = ["telegram_connections", "telegram_link_tokens", "telegram_webhook_receipts"];
    const tables = await client.query("SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1::text[]) ORDER BY relname", [expectedTables]);
    if (tables.rows.length !== expectedTables.length) throw new Error("Expected Telegram test tables are missing after migration.");
    const final = migrations.rows.at(-1)?.migration_name ?? "none";
    console.log(`Linux migration report: count=${migrations.rows.length}; final=${final}; telegramTables=${tables.rows.map((row) => row.relname).join(",")}`);
  } finally { await client.end(); }
}

main().catch((error) => { console.error(`Migration report failed: ${error instanceof Error ? error.message : "unknown error."}`); process.exitCode = 1; });
