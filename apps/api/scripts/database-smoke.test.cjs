const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

test("database smoke fails safely when DATABASE_URL is absent", () => {
  const result = spawnSync(process.execPath, ["scripts/database-smoke.cjs"], { cwd: path.resolve(__dirname, ".."), env: { PATH: process.env.PATH }, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.trim(), "errorType: configuration");
  const output = `${result.stdout}\n${result.stderr}`;
  for (const forbidden of ["postgresql://", "password", "DATABASE_URL", "Error:", "Prisma"]) assert.equal(output.includes(forbidden), false);
});
