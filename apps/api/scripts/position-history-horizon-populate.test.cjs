const assert = require("node:assert/strict");
const test = require("node:test");
const cli = require("./position-history-horizon-populate.cjs");

function result(overrides = {}) {
  return { horizonFrom: new Date("2026-05-13T02:00:00Z"), horizonTo: new Date("2026-08-11T02:00:00Z"), policyDays: 90, slicesTotal: 13, slicesVisited: 1, slicesAlreadyComplete: 0, providerDisabledExcluded: 0, windowsRequested: 2, providerRequests: 0, providerRows: 3, candidates: 3, inserted: 2, duplicates: 1, invalid: 0, retries: 0, rateLimitResponses: 0, stoppedByBudget: true, horizonComplete: false, currentSliceFrom: new Date("2026-08-04T02:00:00Z"), currentSliceTo: new Date("2026-08-11T02:00:00Z"), ...overrides };
}

test("requires strict absolute --to and required positive max-windows with only optional disabled exclusion", () => {
  const parsed = cli.parseArguments(["--to", "2026-08-11T04:00:00+02:00", "--max-windows", "200", "--exclude-provider-disabled"]);
  assert.equal(parsed.to.toISOString(), "2026-08-11T02:00:00.000Z");
  assert.deepEqual(parsed.options, { maxWindows: 200, excludeProviderDisabled: true });
  for (const invalid of [[], ["--to", "2026-08-11T02:00:00Z"], ["--max-windows", "1"], ["--to", "2026-08-11", "--max-windows", "1"], ["--to", "2026-08-11T02:00:00Z", "--max-windows", "0"], ["--to", "2026-08-11T02:00:00Z", "--max-windows", "1.5"], ["--to", "2026-08-11T02:00:00Z", "--max-windows", "1", "--max-vehicles", "1"]]) assert.throws(() => cli.parseArguments(invalid));
});

test("budget stop is successful non-error output with safe aggregate and exact current slice", async () => {
  const lines = [];
  let received;
  class Service {}
  const app = { get: () => ({ run: async (...args) => { received = args; return result(); } }), close: async () => undefined };
  assert.equal(await cli.run(["--to", "2026-08-11T02:00:00Z", "--max-windows", "2"], { loadRootEnv: () => undefined, Module: class {}, Service, createApplicationContext: async () => app, output: (line) => lines.push(line) }), 0);
  assert.deepEqual(received, [new Date("2026-08-11T02:00:00Z"), { maxWindows: 2 }]);
  assert.ok(lines.includes("horizon population success: true"));
  assert.ok(lines.includes("stopped by budget: true"));
  assert.ok(lines.includes("horizon complete: false"));
  assert.ok(lines.includes("eQuGPS historical positions requests: 0"));
});

test("later provider failure prints known prior-slice truth and n/a for unavailable failing-slice aggregate", async () => {
  const { EquGpsHttpError } = require("@taxi-gps/equgps");
  const lines = [];
  class Service {}
  const failure = Object.assign(new Error("safe wrapper"), { name: "PositionHistoryHorizonPopulationError", progress: result({ windowsRequested: 3, providerRequests: 4, inserted: 3, stoppedByBudget: false }), underlyingError: new EquGpsHttpError(400, "getHistoricalPositions") });
  const app = { get: () => ({ run: async () => { throw failure; } }), close: async () => undefined };
  assert.equal(await cli.run(["--to", "2026-08-11T02:00:00Z", "--max-windows", "10"], { loadRootEnv: () => undefined, Module: class {}, Service, createApplicationContext: async () => app, output: (line) => lines.push(line) }), 1);
  assert.ok(lines.includes("committed windows: 3"));
  assert.ok(lines.includes("provider requests: 4"));
  assert.ok(lines.includes("history inserted: 3"));
  assert.ok(lines.includes("current slice result-derived counters: n/a"));
  assert.ok(lines.includes("reported counters scope: completed prior slices only"));
  assert.ok(lines.includes("provider category: permanent_http"));
  assert.ok(lines.includes("provider HTTP status: 400"));
  const output = lines.join("\n");
  for (const forbidden of ["getHistoricalPositions", "deviceId", "token", "password", "safe wrapper"]) assert.equal(output.includes(forbidden), false);
});

test("network guard permits only official historical positions and blocks every other capability", async () => {
  const lines = [];
  class Service {}
  const app = { get: () => ({ run: async () => { await global.fetch("https://provider.test/api/devices"); return result(); } }), close: async () => undefined };
  assert.equal(await cli.run(["--to", "2026-08-11T02:00:00Z", "--max-windows", "1"], { loadRootEnv: () => { process.env.EQUGPS_BASE_URL = "https://provider.test/api"; }, Module: class {}, Service, createApplicationContext: async () => app, output: (line) => lines.push(line) }), 1);
  assert.ok(lines.includes("eQuGPS devices requests: 1"));
  assert.ok(lines.includes("eQuGPS historical positions requests: 0"));
});
