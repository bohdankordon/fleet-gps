const assert = require("node:assert/strict");
const test = require("node:test");
const cli = require("./position-history-horizon-plan.cjs");

function result() {
  return {
    horizon: { from: new Date("2026-05-13T02:00:00Z"), to: new Date("2026-08-11T02:00:00Z"), policyDays: 90 },
    targets: { total: 2, fullSevenDay: 1, remainderDurationMs: 6 * 86_400_000 },
    fleet: { total: 2, providerDisabled: 1, providerEligible: 1 },
    targetVehiclePairs: { total: 4, completed: 1, incomplete: 3, providerEligibleIncomplete: 1 },
    estimatedRemainingHourlyWindows: 168,
    slices: [
      { index: 0, from: new Date("2026-05-13T02:00:00Z"), to: new Date("2026-05-19T02:00:00Z"), durationMs: 6 * 86_400_000, vehiclesTotal: 2, completed: 0, running: 0, pending: 1, noExactCheckpoint: 1, providerDisabledVehicles: 1, remainingFleetVehicles: 2, providerEligibleRemaining: 1, estimatedRemainingHourlyWindows: 144 },
      { index: 1, from: new Date("2026-05-19T02:00:00Z"), to: new Date("2026-05-26T02:00:00Z"), durationMs: 7 * 86_400_000, vehiclesTotal: 2, completed: 1, running: 0, pending: 0, noExactCheckpoint: 1, providerDisabledVehicles: 1, remainingFleetVehicles: 1, providerEligibleRemaining: 1, estimatedRemainingHourlyWindows: 24 },
    ],
  };
}

test("strictly requires one absolute --to and exposes no --days contract", () => {
  assert.equal(cli.parseArguments(["--to", "2026-08-11T04:00:00+02:00"]).to.toISOString(), "2026-08-11T02:00:00.000Z");
  for (const invalid of [[], ["--to", "2026-08-11"], ["--to", "2026-08-11T02:00:00Z", "--days", "365"], ["--from", "2026-08-11T02:00:00Z"]]) assert.throws(() => cli.parseArguments(invalid));
});

test("delegates once and prints deterministic chronological aggregate-only output", async () => {
  const lines = [];
  let received;
  class Service {}
  const app = { get: () => ({ run: async (to) => { received = to; return result(); } }), close: async () => undefined };
  assert.equal(await cli.run(["--to", "2026-08-11T02:00:00Z"], { loadRootEnv: () => undefined, Module: class {}, Service, createApplicationContext: async () => app, output: (line) => lines.push(line) }), 0);
  assert.equal(received.toISOString(), "2026-08-11T02:00:00.000Z");
  assert.ok(lines.includes("policy days: 90"));
  assert.ok(lines.includes("network requests: 0"));
  assert.ok(lines.findIndex((line) => line.startsWith("slice 1:")) < lines.findIndex((line) => line.startsWith("slice 2:")));
  const output = lines.join("\n");
  for (const forbidden of ["externalDeviceId", "latitude", "longitude", "fingerprint", "00000000-0000", "token", "password"]) assert.equal(output.includes(forbidden), false);
});

test("any accidental network call fails closed", async () => {
  const lines = [];
  class Service {}
  const app = { get: () => ({ run: async () => { await global.fetch("https://provider.test/positions"); return result(); } }), close: async () => undefined };
  assert.equal(await cli.run(["--to", "2026-08-11T02:00:00Z"], { loadRootEnv: () => undefined, Module: class {}, Service, createApplicationContext: async () => app, output: (line) => lines.push(line) }), 1);
  assert.ok(lines.includes("network requests: 1"));
});
