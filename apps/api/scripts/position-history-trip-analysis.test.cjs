const assert = require("node:assert/strict");
const test = require("node:test");
const cli = require("./position-history-trip-analysis.cjs");

const vehicleId = "00000000-0000-4000-8000-000000000001";

function result() {
  const from = new Date("2026-08-01T00:00:00Z");
  const to = new Date("2026-08-01T01:00:00Z");
  return {
    vehicle: { id: vehicleId, name: "Vehicle" },
    range: { from, to, inclusive: true },
    summary: { rawObservationCount: 2, continuitySegmentCount: 1, tripCount: 1, stopCount: 0, gapCount: 0, totalObservedTripDistanceMeters: 12.5, firstObservationAt: from, lastObservationAt: to },
    trips: [{ startAt: from, endAt: to, durationSeconds: 3600, observedDistanceMeters: 12.5, startPosition: { observedAt: from, latitude: 49, longitude: 28 }, endPosition: { observedAt: to, latitude: 49.1, longitude: 28.1 }, terminationReason: "RANGE_END", startsAtRangeBoundary: true, endsAtRangeBoundary: true, observationCount: 2 }],
    stops: [], gaps: [],
  };
}

test("strictly requires vehicle/from/to, validates UUID and absolute timestamps", () => {
  const parsed = cli.parseArguments(["--vehicle", vehicleId, "--from", "2026-08-01T02:00:00+02:00", "--to", "2026-08-02T00:00:00Z"]);
  assert.equal(parsed.vehicleId, vehicleId);
  assert.equal(parsed.range.from.toISOString(), "2026-08-01T00:00:00.000Z");
  for (const invalid of [
    [],
    ["--vehicle", "bad", "--from", "2026-08-01T00:00:00Z", "--to", "2026-08-02T00:00:00Z"],
    ["--vehicle", vehicleId, "--from", "2026-08-01", "--to", "2026-08-02T00:00:00Z"],
    ["--vehicle", vehicleId, "--from", "2026-08-01T00:00:00Z", "--to", "2026-08-01T00:00:00Z"],
    ["--vehicle", vehicleId, "--from", "2026-08-01T00:00:00Z", "--to", "2026-08-08T00:00:00.001Z"],
    ["--vehicle", vehicleId, "--from", "2026-08-01T00:00:00Z", "--to", "2026-08-02T00:00:00Z", "--extra", "x"],
  ]) assert.throws(() => cli.parseArguments(invalid));
});

test("exactly seven absolute days is accepted", () => {
  const parsed = cli.parseArguments(["--vehicle", vehicleId, "--from", "2026-08-01T00:00:00Z", "--to", "2026-08-08T00:00:00Z"]);
  assert.equal(parsed.range.to.getTime() - parsed.range.from.getTime(), 7 * 86_400_000);
});

test("delegates once, closes the app, prints derived shapes, and performs zero network calls", async () => {
  const lines = [];
  let received;
  let closes = 0;
  class Service {}
  const app = { get: () => ({ analyze: async (id, range) => { received = { id, range }; return result(); } }), close: async () => { closes += 1; } };
  const code = await cli.run(["--vehicle", vehicleId, "--from", "2026-08-01T00:00:00Z", "--to", "2026-08-01T01:00:00Z"], { loadRootEnv: () => undefined, Module: class {}, Service, createApplicationContext: async () => app, output: (line) => lines.push(line) });
  assert.equal(code, 0);
  assert.equal(received.id, vehicleId);
  assert.equal(closes, 1);
  assert.ok(lines.includes("network requests: 0"));
  assert.ok(lines.some((line) => line.includes('"observedDistanceMeters":12.5')));
  assert.ok(lines.some((line) => line.includes("gap results: []")));
  const output = lines.join("\n");
  for (const forbidden of ["externalDeviceId", "fixFingerprint", "provider", "token", "password"]) assert.equal(output.includes(forbidden), false);
});

test("unknown vehicle is an explicit operator error", async () => {
  const lines = [];
  class Service {}
  const error = new Error("missing"); error.name = "TripStopAnalyticsVehicleNotFoundError";
  const app = { get: () => ({ analyze: async () => { throw error; } }), close: async () => undefined };
  assert.equal(await cli.run(["--vehicle", vehicleId, "--from", "2026-08-01T00:00:00Z", "--to", "2026-08-01T01:00:00Z"], { loadRootEnv: () => undefined, Module: class {}, Service, createApplicationContext: async () => app, output: (line) => lines.push(line) }), 1);
  assert.ok(lines.includes("error type: vehicle_not_found"));
});

test("any attempted provider or other network call fails closed", async () => {
  const lines = [];
  class Service {}
  const app = { get: () => ({ analyze: async () => { await global.fetch("https://provider.test/positions"); return result(); } }), close: async () => undefined };
  assert.equal(await cli.run(["--vehicle", vehicleId, "--from", "2026-08-01T00:00:00Z", "--to", "2026-08-01T01:00:00Z"], { loadRootEnv: () => undefined, Module: class {}, Service, createApplicationContext: async () => app, output: (line) => lines.push(line) }), 1);
  assert.ok(lines.includes("network requests: 1"));
});

