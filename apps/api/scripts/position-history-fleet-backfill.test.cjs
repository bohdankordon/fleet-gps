const assert = require("node:assert/strict");
const test = require("node:test");
const cli = require("./position-history-fleet-backfill.cjs");

function aggregate(overrides = {}) {
  return {
    plan: false,
    vehiclesTotal: 2,
    vehiclesConsidered: 2,
    vehiclesStarted: 2,
    vehiclesCompleted: 2,
    vehiclesAlreadyCompleted: 0,
    vehiclesRemaining: 0,
    pendingVehicles: 2,
    partialVehicles: 0,
    unmappedVehicles: 0,
    estimatedRemainingWindows: 4,
    windowsRequested: 4,
    providerRequests: 0,
    providerRows: 0,
    candidates: 0,
    inserted: 0,
    duplicates: 0,
    invalid: 0,
    retries: 0,
    rateLimitResponses: 0,
    stoppedByBudget: false,
    ...overrides,
  };
}

function vehicleResult(overrides = {}) {
  return {
    alreadyCompleted: false,
    resumed: false,
    requests: 1,
    providerRows: 1,
    historyCandidates: 1,
    historyInserted: 1,
    historyDuplicates: 0,
    historySkippedInvalid: 0,
    windowsCompleted: 1,
    retries: 0,
    rateLimitResponses: 0,
    completed: true,
    ...overrides,
  };
}

test("requires explicit absolute range and validates seven-day and positive safe budgets before initialization", async () => {
  const invalid = [
    [],
    ["--from", "2026-08-01T00:00:00Z"],
    ["--from", "2026-08-01", "--to", "2026-08-02T00:00:00Z"],
    ["--from", "2026-08-01T00:00:00Z", "--to", "2026-08-08T00:00:00.001Z"],
    ["--from", "2026-08-01T00:00:00Z", "--to", "2026-08-02T00:00:00Z", "--max-vehicles", "0"],
    ["--from", "2026-08-01T00:00:00Z", "--to", "2026-08-02T00:00:00Z", "--max-windows", "1.5"],
    ["--from", "2026-08-01T00:00:00Z", "--to", "2026-08-02T00:00:00Z", "--plan", "--plan"],
  ];
  for (const argv of invalid) {
    let initialized = 0;
    const lines = [];
    assert.equal(await cli.run(argv, { loadRootEnv: () => { initialized += 1; }, output: (line) => lines.push(line) }), 1);
    assert.equal(initialized, 0);
    assert.ok(lines.includes("error type: invalid_arguments"));
  }
});

test("parses exact seven-day fleet target and global budgets", () => {
  const parsed = cli.parseArguments(["--from", "2026-08-01T02:00:00+02:00", "--to", "2026-08-08T00:00:00Z", "--max-vehicles", "2", "--max-windows", "169", "--plan"]);
  assert.equal(parsed.target.from.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(parsed.target.to.toISOString(), "2026-08-08T00:00:00.000Z");
  assert.deepEqual(parsed.options, { maxVehicles: 2, maxWindows: 169, plan: true });
});

test("delegates once to fleet service and emits only safe aggregate identity-free output", async () => {
  const lines = [];
  let received;
  let closed = 0;
  class Service {}
  const app = { get: () => ({ run: async (...args) => { received = args; return aggregate({ duplicates: 3 }); } }), close: async () => { closed += 1; } };
  const argv = ["--from", "2026-08-01T00:00:00Z", "--to", "2026-08-01T02:00:00Z", "--max-vehicles", "2", "--max-windows", "2"];
  assert.equal(await cli.run(argv, { loadRootEnv: () => undefined, Module: class {}, Service, createApplicationContext: async () => app, output: (line) => lines.push(line) }), 0);
  assert.deepEqual(received, [{ from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-08-01T02:00:00Z") }, { maxVehicles: 2, maxWindows: 2 }]);
  assert.equal(closed, 1);
  assert.ok(lines.includes("fleet backfill success: true"));
  assert.ok(lines.includes("history duplicates: 3"));
  assert.ok(lines.includes("provider requests: 0"));
  assert.ok(lines.includes("history inserted: 0"));
  assert.ok(lines.includes("stopped by budget: false"));
  assert.equal(lines.some((line) => line.endsWith(": n/a")), false);
  const output = lines.join("\n");
  for (const forbidden of ["deviceId", "externalDeviceId", "latitude", "longitude", "token", "password", "00000000-0000"]) assert.equal(output.includes(forbidden), false);
});

test("plan mode reports zero network and forwards read-only intent", async () => {
  const lines = [];
  let options;
  class Service {}
  const app = { get: () => ({ run: async (_target, value) => { options = value; return aggregate({ plan: true, vehiclesStarted: 0, vehiclesCompleted: 0, windowsRequested: 0 }); } }), close: async () => undefined };
  assert.equal(await cli.run(["--from", "2026-08-01T00:00:00Z", "--to", "2026-08-02T00:00:00Z", "--plan"], { loadRootEnv: () => undefined, Module: class {}, Service, createApplicationContext: async () => app, output: (line) => lines.push(line) }), 0);
  assert.deepEqual(options, { plan: true });
  assert.ok(lines.includes("plan: true"));
  assert.ok(lines.includes("eQuGPS historical positions requests: 0"));
  assert.ok(lines.includes("unexpected external requests: 0"));
});

test("post-result network assertion failure reports overall failure while preserving factual aggregate values", async () => {
  const lines = [];
  let closed = 0;
  class Service {}
  const returned = aggregate({ vehiclesCompleted: 1, windowsRequested: 2, providerRequests: 1, providerRows: 4, inserted: 3, duplicates: 1 });
  const app = { get: () => ({ run: async () => returned }), close: async () => { closed += 1; } };
  const code = await cli.run(
    ["--from", "2026-08-01T00:00:00Z", "--to", "2026-08-01T01:00:00Z"],
    { loadRootEnv: () => undefined, Module: class {}, Service, createApplicationContext: async () => app, output: (line) => lines.push(line) },
  );
  assert.equal(code, 1);
  assert.equal(closed, 1);
  assert.ok(lines.includes("fleet backfill success: false"));
  assert.ok(lines.includes("vehicles completed: 1"));
  assert.ok(lines.includes("windows requested: 2"));
  assert.ok(lines.includes("provider requests: 1"));
  assert.ok(lines.includes("provider rows: 4"));
  assert.ok(lines.includes("history inserted: 3"));
  assert.ok(lines.includes("history duplicates: 1"));
  assert.equal(lines.some((line) => line.endsWith(": n/a")), false);
  assert.ok(lines.includes("eQuGPS historical positions requests: 0"));
  assert.ok(lines.includes("error type: unknown"));
});

test("later provider failure reports unavailable aggregates instead of false zero after earlier committed work", async () => {
  const { PositionHistoryFleetBackfillService } = require("../dist/modules/position-history-backfill/position-history-fleet-backfill.service");
  const ids = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
  ];
  const calls = [];
  let firstCommitted = false;
  const providerFailure = Object.assign(new Error("provider failure"), { name: "EquGpsTimeoutError" });
  const engine = {
    run: async (target) => {
      calls.push(target.vehicleId);
      await global.fetch(`https://provider.test/api/positions?deviceId=1&from=${encodeURIComponent(target.from.toISOString())}&to=${encodeURIComponent(target.to.toISOString())}`);
      if (target.vehicleId === ids[0]) { firstCommitted = true; return vehicleResult(); }
      throw providerFailure;
    },
  };
  const repository = { inspect: async () => ids.map((vehicleId, index) => ({ vehicleId, externalDeviceId: index + 1, checkpoint: null })) };
  const service = new PositionHistoryFleetBackfillService(engine, repository);
  const lines = [];
  const nativeFetch = global.fetch;
  const originalBaseUrl = process.env.EQUGPS_BASE_URL;
  global.fetch = async () => ({ ok: true });
  class Service {}
  const app = { get: () => service, close: async () => undefined };
  try {
    const code = await cli.run(
      ["--from", "2026-08-01T00:00:00Z", "--to", "2026-08-01T01:00:00Z"],
      {
        loadRootEnv: () => { process.env.EQUGPS_BASE_URL = "https://provider.test/api"; },
        Module: class {},
        Service,
        createApplicationContext: async () => app,
        output: (line) => lines.push(line),
      },
    );
    assert.equal(code, 1);
  } finally {
    global.fetch = nativeFetch;
    if (originalBaseUrl === undefined) delete process.env.EQUGPS_BASE_URL;
    else process.env.EQUGPS_BASE_URL = originalBaseUrl;
  }
  assert.equal(firstCommitted, true);
  assert.deepEqual(calls, [ids[0], ids[1]]);
  for (const label of [
    "plan",
    "vehicles total",
    "vehicles considered",
    "vehicles started",
    "vehicles completed",
    "vehicles already completed",
    "vehicles remaining",
    "pending vehicles",
    "partial vehicles",
    "unmapped vehicles",
    "estimated remaining windows",
    "windows requested",
    "provider requests",
    "provider rows",
    "history candidates",
    "history inserted",
    "history duplicates",
    "history skipped invalid",
    "retries",
    "rate-limit responses",
    "stopped by budget",
  ]) assert.ok(lines.includes(`${label}: n/a`), label);
  for (const falseClaim of ["vehicles completed: 0", "windows requested: 0", "history inserted: 0"]) assert.equal(lines.includes(falseClaim), false, falseClaim);
  assert.ok(lines.includes("eQuGPS historical positions requests: 2"));
  assert.ok(lines.includes("unexpected external requests: 0"));
  assert.ok(lines.includes("application closed: true"));
  assert.ok(lines.includes("error type: provider"));
});
