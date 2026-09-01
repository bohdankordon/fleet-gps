"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { parseLocalDevelopmentDatabase } = require("./dev-vehicle-detail-fixtures-safety.cjs");

const local = Object.freeze({ NODE_ENV: "development", DATABASE_URL: "postgresql://local:local@127.0.0.1:5433/taxi_gps?schema=public" });
test("accepts only the known loopback development target", () => {
  assert.deepEqual(parseLocalDevelopmentDatabase(local), { hostname: "127.0.0.1", database: "taxi_gps", port: "5433", mode: "development" });
});
for (const [name, env] of Object.entries({
  "production mode": { ...local, NODE_ENV: "production" },
  "remote host": { ...local, DATABASE_URL: "postgresql://local:local@db.example.test:5433/taxi_gps" },
  "production-looking host": { ...local, DATABASE_URL: "postgresql://local:local@prod-db.example.test:5433/taxi_gps" },
  "wrong database": { ...local, DATABASE_URL: "postgresql://local:local@127.0.0.1:5433/taxi_gps_production" },
  "test database": { ...local, TEST_DATABASE: "1" },
  "wrong port": { ...local, DATABASE_URL: "postgresql://local:local@127.0.0.1:5434/taxi_gps" },
})) test(`rejects ${name}`, () => assert.throws(() => parseLocalDevelopmentDatabase(env), /fixture/));
