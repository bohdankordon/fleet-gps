import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";

const root = path.resolve(process.cwd());
const script = readFileSync(path.join(root, "dev.ps1"), "utf8");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

test("start applies checked-in migrations after PostgreSQL readiness and before app processes", () => {
  const startBlock = script.slice(script.indexOf("\u0027start\u0027 {"));
  const pgAt = startBlock.indexOf("Start-Postgres");
  const migrateAt = startBlock.indexOf("Invoke-DevMigrations");
  const launchAt = startBlock.indexOf("Start-ManagedProcess");
  assert.ok(pgAt >= 0 && migrateAt > pgAt && launchAt > migrateAt, "order: postgres -> migrations -> api/web");
  assert.match(script, /function Invoke-DevMigrations/);
  assert.match(script, /db:migrate:deploy/);
});

test("startup uses deploy semantics and never generates or reconciles migrations", () => {
  assert.doesNotMatch(script, /migrate dev/);
  assert.doesNotMatch(script, /db:migrate:dev/);
  assert.doesNotMatch(script, /prisma:migrate:dev/);
  assert.doesNotMatch(script, /migrate reset|migrate resolve|--create-only/);
  assert.equal(pkg.scripts["db:migrate:deploy"], "npm --workspace @taxi-gps/api run prisma:migrate:deploy");
});

test("migration failure blocks startup without reset and preserves the database", () => {
  assert.match(script, /Database migration deployment failed/);
  assert.match(script, /API\/Web were not started/);
  assert.match(script, /database was preserved/i);
  assert.doesNotMatch(script, /migrate reset|db:reset|prisma migrate reset|Initialise.*database/i);
});

test("local-only target is verified without printing secrets", () => {
  assert.match(script, /function Get-DevDatabaseTarget/);
  assert.match(script, /127\.0\.0\.1.*localhost/);
  assert.match(script, /is not the local development database/);
  assert.doesNotMatch(script, /Write-Host.*PASSWORD|Write-Host.*DATABASE_URL\s*$/m);
  assert.equal(script.includes("SENTINEL"), false);
});

test("managed-process tracking, port safety, background-off flags, and stop/status are unchanged", () => {
  assert.match(script, /Get-ManagedProcess -Settings \$settings -CleanStale/);
  assert.match(script, /Assert-PortAvailable/);
  assert.match(script, /already occupied by unmanaged process/);
  for (const flag of ["SYNC_SCHEDULER_ENABLED", "ALERT_INGESTION_ENABLED", "POSITION_HISTORY_MAINTENANCE_ENABLED", "POSITION_HISTORY_RETENTION_ENABLED", "POSITION_HISTORY_CONTINUOUS_INGESTION_ENABLED", "TELEGRAM_NOTIFICATIONS_ENABLED", "OPS_ALERTS_ENABLED"]) {
    assert.ok(script.includes(flag) && script.includes("false"), flag);
  }
  assert.match(script, /\u0027stop\u0027\s*\{[\s\S]*?Stop-ManagedProcess[\s\S]*?PostgreSQL stopped/);
  assert.match(script, /\u0027status\u0027\s*\{[\s\S]*?Show-Status/);
});
