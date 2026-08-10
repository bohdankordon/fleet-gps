const assert = require("node:assert/strict");
const test = require("node:test");
const cli = require("./position-history-backfill.cjs");

const vehicleId = "123e4567-e89b-42d3-a456-426614174000";

test("requires explicit vehicle and absolute non-empty range before initialization", async () => {
  for (const argv of [[], ["--vehicle", vehicleId], ["--vehicle", vehicleId, "--from", "2026-08-10", "--to", "2026-08-10T01:00:00Z"], ["--vehicle", vehicleId, "--from", "2026-02-30T00:00:00Z", "--to", "2026-08-10T01:00:00Z"], ["--vehicle", vehicleId, "--from", "2026-04-31T00:00:00Z", "--to", "2026-08-10T01:00:00Z"], ["--vehicle", vehicleId, "--from", "2026-08-10T00:00:00+24:00", "--to", "2026-08-10T01:00:00Z"], ["--vehicle", vehicleId, "--from", "2026-08-10T01:00:00Z", "--to", "2026-08-10T01:00:00Z"], ["--vehicle", vehicleId, "--from", "2026-08-10T00:00:00Z", "--to", "2026-08-10T01:00:00Z", "--max-windows", "0"]]) {
    let initialized = 0;
    const lines = [];
    assert.equal(await cli.run(argv, { loadRootEnv: () => { initialized += 1; }, output: (line) => lines.push(line) }), 1);
    assert.equal(initialized, 0);
    assert.ok(lines.includes("error type: invalid_arguments"));
  }
});

test("strictly validates calendar dates and explicit ISO offsets", () => {
  assert.equal(cli.parseTimestamp("2024-02-29T23:59:59Z").toISOString(), "2024-02-29T23:59:59.000Z");
  assert.equal(cli.parseTimestamp("2026-08-10T12:19:21Z").toISOString(), "2026-08-10T12:19:21.000Z");
  assert.equal(cli.parseTimestamp("2026-08-10T14:19:21+02:00").toISOString(), "2026-08-10T12:19:21.000Z");
  for (const value of ["2026-02-30T00:00:00Z", "2026-04-31T00:00:00Z", "2026-08-10T00:00:00", "2026-08-10T00:00:00+24:00", "2026-08-10T00:00:00+14:01"]) {
    assert.throws(() => cli.parseTimestamp(value), /invalid arguments/);
  }
});

test("runs only the explicit target and emits aggregate output without identity", async () => {
  const lines = [];
  const target = { vehicleId, from: new Date("2026-08-10T00:00:00Z"), to: new Date("2026-08-10T01:00:00Z") };
  const result = { alreadyCompleted: false, resumed: false, requests: 0, providerRows: 0, historyCandidates: 0, historyInserted: 0, historyDuplicates: 0, historySkippedInvalid: 0, windowsCompleted: 1, retries: 0, rateLimitResponses: 0, completed: true };
  class Service {}
  let received;
  let closed = 0;
  const app = { get: () => ({ run: async (...value) => { received = value; return result; } }), close: async () => { closed += 1; } };
  assert.equal(await cli.run(["--vehicle", vehicleId, "--from", target.from.toISOString(), "--to", target.to.toISOString(), "--max-windows", "1"], { loadRootEnv: () => undefined, Module: class {}, Service, createApplicationContext: async () => app, output: (line) => lines.push(line) }), 0);
  assert.deepEqual(received, [target, { maxWindows: 1 }]);
  assert.equal(closed, 1);
  assert.equal(lines.some((line) => line.includes(vehicleId)), false);
  assert.ok(lines.includes("backfill success: true"));
});

test("network classifier distinguishes prohibited external capabilities", () => {
  assert.equal(cli.classifyRequest("https://provider.test/api/positions?deviceId=1&from=a&to=b"), "historicalPositions");
  assert.equal(cli.classifyRequest("https://provider.test/api/positions"), "latestPositions");
  assert.equal(cli.classifyRequest("https://provider.test/api/devices"), "devices");
  assert.equal(cli.classifyRequest("https://provider.test/api/devices/routes-new"), "routesNew");
  assert.equal(cli.classifyRequest("https://api.telegram.org/bot/send"), "telegram");
  assert.equal(cli.classifyRequest("https://tiles.openfreemap.org/a"), "openFreeMap");
  assert.equal(cli.classifyRequest("https://example.test/a"), "unexpected");
  assert.equal(cli.isAllowedHistoricalRequest("https://provider.test/api/positions?deviceId=1&from=a&to=b", "https://provider.test/api"), true);
  assert.equal(cli.isAllowedHistoricalRequest("https://other.test/api/positions?deviceId=1&from=a&to=b", "https://provider.test/api"), false);
  assert.equal(cli.isAllowedHistoricalRequest("https://provider.test/api/positions?deviceId=1&from=a", "https://provider.test/api"), false);
});
