const assert = require("node:assert/strict");
const test = require("node:test");
const cli = require("./position-history-coverage.cjs");

function result() {
  return {
    range: { from: new Date("2026-08-10T02:00:00Z"), to: new Date("2026-08-11T02:00:00Z"), inclusive: true },
    checkpointCoverage: { vehiclesTotal: 2, completed: 1, running: 0, pending: 0, noExactCheckpoint: 1 },
    observationPresence: { rowsTotal: 2, vehiclesWithObservations: 1, vehiclesWithoutObservations: 1, fleetSyncRows: 1, historicalBackfillRows: 1, firstObservedAt: new Date("2026-08-10T02:00:00Z"), lastObservedAt: new Date("2026-08-11T02:00:00Z") },
    checkpointObservationCrossSummary: { completedWithObservations: 0, completedWithoutObservations: 1, incompleteOrNoExactCheckpointWithObservations: 1, incompleteOrNoExactCheckpointWithoutObservations: 0 },
    providerDisabledVehicles: 1,
  };
}

test("strictly requires only absolute from/to and accepts exactly seven absolute days", () => {
  const parsed = cli.parseArguments(["--from", "2026-08-01T02:00:00+02:00", "--to", "2026-08-08T00:00:00Z"]);
  assert.equal(parsed.from.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(parsed.to.toISOString(), "2026-08-08T00:00:00.000Z");
  for (const invalid of [[], ["--from", "2026-08-01", "--to", "2026-08-02T00:00:00Z"], ["--from", "2026-08-01T00:00:00Z", "--to", "2026-08-08T00:00:00.001Z"], ["--from", "2026-08-01T00:00:00Z", "--to", "2026-08-02T00:00:00Z", "--extra", "x"]]) assert.throws(() => cli.parseArguments(invalid));
});

test("delegates once, blocks all network, closes the app, and emits safe aggregates", async () => {
  const lines = [];
  let received;
  let closed = 0;
  class Service {}
  const app = { get: () => ({ run: async (target) => { received = target; return result(); } }), close: async () => { closed += 1; } };
  const code = await cli.run(["--from", "2026-08-10T02:00:00Z", "--to", "2026-08-11T02:00:00Z"], { loadRootEnv: () => undefined, Module: class {}, Service, createApplicationContext: async () => app, output: (line) => lines.push(line) });
  assert.equal(code, 0);
  assert.deepEqual(received, { from: new Date("2026-08-10T02:00:00Z"), to: new Date("2026-08-11T02:00:00Z") });
  assert.equal(closed, 1);
  assert.ok(lines.includes("network requests: 0"));
  assert.ok(lines.includes("COMPLETED exact checkpoint + zero observations: 1"));
  const output = lines.join("\n");
  for (const forbidden of ["externalDeviceId", "latitude", "longitude", "fingerprint", "provider ID", "00000000-0000"]) assert.equal(output.includes(forbidden), false);
});

test("any attempted provider or other network call makes the audit fail", async () => {
  const lines = [];
  class Service {}
  const app = { get: () => ({ run: async () => { await global.fetch("https://provider.test/devices"); return result(); } }), close: async () => undefined };
  const code = await cli.run(["--from", "2026-08-10T02:00:00Z", "--to", "2026-08-11T02:00:00Z"], { loadRootEnv: () => undefined, Module: class {}, Service, createApplicationContext: async () => app, output: (line) => lines.push(line) });
  assert.equal(code, 1);
  assert.ok(lines.includes("network requests: 1"));
});
