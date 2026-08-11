import assert from "node:assert/strict";
import test from "node:test";
import { PositionBackfillStatus } from "../../generated/prisma/client";
import type { PositionHistoryBackfillService } from "./position-history-backfill.service";
import { PositionHistoryFleetBackfillService } from "./position-history-fleet-backfill.service";
import type { PositionHistoryBackfillResult, PositionHistoryFleetBackfillRepository, PositionHistoryFleetBackfillVehicle } from "./position-history-backfill.types";

const hour = 60 * 60 * 1_000;
const from = new Date("2026-08-01T00:00:00.000Z");
const target = { from, to: new Date(from.getTime() + 3 * hour) };
const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
];

function vehicle(index: number, overrides: Partial<PositionHistoryFleetBackfillVehicle> = {}): PositionHistoryFleetBackfillVehicle {
  return { vehicleId: ids[index]!, externalDeviceId: index + 1, checkpoint: null, ...overrides };
}

function result(overrides: Partial<PositionHistoryBackfillResult> = {}): PositionHistoryBackfillResult {
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

function harness(fleet: readonly PositionHistoryFleetBackfillVehicle[], responses: Array<PositionHistoryBackfillResult | Error> = []) {
  const calls: Array<{ target: { vehicleId: string; from: Date; to: Date }; options: { maxWindows?: number; paceBeforeFirstWindow?: boolean } }> = [];
  let inspections = 0;
  const repository: PositionHistoryFleetBackfillRepository = { inspect: async () => { inspections += 1; return fleet; } };
  const engine = {
    run: async (runTarget: { vehicleId: string; from: Date; to: Date }, options: { maxWindows?: number; paceBeforeFirstWindow?: boolean }) => {
      calls.push({ target: runTarget, options });
      const next = responses.shift() ?? result();
      if (next instanceof Error) throw next;
      return next;
    },
  } as unknown as PositionHistoryBackfillService;
  return { service: new PositionHistoryFleetBackfillService(engine, repository), calls, inspections: () => inspections };
}

test("delegates all pending vehicles to the single-vehicle engine in persisted order with cross-vehicle pacing", async () => {
  const item = harness([vehicle(0), vehicle(1), vehicle(2)]);
  const aggregate = await item.service.run(target);
  assert.deepEqual(item.calls.map((call) => call.target.vehicleId), ids);
  assert.deepEqual(item.calls.map((call) => call.options), [{}, { paceBeforeFirstWindow: true }, { paceBeforeFirstWindow: true }]);
  assert.equal(aggregate.vehiclesStarted, 3);
  assert.equal(aggregate.vehiclesCompleted, 3);
  assert.equal(aggregate.windowsRequested, 3);
  assert.equal(aggregate.inserted, 3);
  assert.equal(aggregate.vehiclesRemaining, 0);
});

test("skips completed targets, delegates partial targets, and all-completed replay makes zero engine calls", async () => {
  const completed = { nextFrom: target.to, status: PositionBackfillStatus.COMPLETED };
  const partial = { nextFrom: new Date(from.getTime() + hour), status: PositionBackfillStatus.RUNNING };
  const mixed = harness([vehicle(0, { checkpoint: completed }), vehicle(1, { checkpoint: partial }), vehicle(2)]);
  const aggregate = await mixed.service.run(target);
  assert.deepEqual(mixed.calls.map((call) => call.target.vehicleId), [ids[1], ids[2]]);
  assert.equal(aggregate.vehiclesAlreadyCompleted, 1);
  assert.equal(aggregate.partialVehicles, 1);
  assert.equal(aggregate.estimatedRemainingWindows, 5);

  const replay = harness([vehicle(0, { checkpoint: completed }), vehicle(1, { checkpoint: completed })]);
  const repeated = await replay.service.run(target);
  assert.equal(replay.calls.length, 0);
  assert.equal(repeated.providerRequests, 0);
  assert.equal(repeated.vehiclesAlreadyCompleted, 2);
  assert.equal(repeated.vehiclesRemaining, 0);
});

test("global max-window budget is passed as a decreasing remainder and can stop mid-vehicle", async () => {
  const item = harness([vehicle(0), vehicle(1), vehicle(2)], [
    result({ windowsCompleted: 1, requests: 1, completed: true }),
    result({ windowsCompleted: 1, requests: 1, completed: false }),
  ]);
  const aggregate = await item.service.run(target, { maxWindows: 2 });
  assert.deepEqual(item.calls.map((call) => call.options.maxWindows), [2, 1]);
  assert.equal(item.calls.length, 2);
  assert.equal(aggregate.windowsRequested, 2);
  assert.equal(aggregate.vehiclesCompleted, 1);
  assert.equal(aggregate.vehiclesRemaining, 2);
  assert.equal(aggregate.stoppedByBudget, true);
});

test("max-vehicle budget selects a deterministic prefix and stops between vehicles", async () => {
  const item = harness([vehicle(0), vehicle(1), vehicle(2)]);
  const aggregate = await item.service.run(target, { maxVehicles: 1, maxWindows: 10 });
  assert.deepEqual(item.calls.map((call) => call.target.vehicleId), [ids[0]]);
  assert.equal(aggregate.vehiclesConsidered, 1);
  assert.equal(aggregate.vehiclesRemaining, 2);
  assert.equal(aggregate.stoppedByBudget, true);
});

test("provider and database failures propagate and never start the next vehicle", async () => {
  for (const failure of [Object.assign(new Error("provider"), { name: "EquGpsTimeoutError" }), Object.assign(new Error("database"), { name: "PrismaClientKnownRequestError" })]) {
    const item = harness([vehicle(0), vehicle(1), vehicle(2)], [result(), failure, result()]);
    await assert.rejects(item.service.run(target), (error) => error === failure);
    assert.deepEqual(item.calls.map((call) => call.target.vehicleId), [ids[0], ids[1]]);
  }
});

test("unmapped persisted identities are reported and never guessed or delegated", async () => {
  const item = harness([vehicle(0, { externalDeviceId: null }), vehicle(1, { externalDeviceId: 0 }), vehicle(2)]);
  const aggregate = await item.service.run(target);
  assert.deepEqual(item.calls.map((call) => call.target.vehicleId), [ids[2]]);
  assert.equal(aggregate.unmappedVehicles, 2);
  assert.equal(aggregate.vehiclesRemaining, 2);
});

test("plan is read-only by contract, estimates exact remaining windows, and reports both budget boundaries", async () => {
  const completed = { nextFrom: target.to, status: PositionBackfillStatus.COMPLETED };
  const partial = { nextFrom: new Date(from.getTime() + hour), status: PositionBackfillStatus.RUNNING };
  const item = harness([vehicle(0, { checkpoint: completed }), vehicle(1, { checkpoint: partial }), vehicle(2, { externalDeviceId: null })]);
  const aggregate = await item.service.run(target, { plan: true, maxVehicles: 2, maxWindows: 1 });
  assert.equal(item.inspections(), 1);
  assert.equal(item.calls.length, 0);
  assert.equal(aggregate.plan, true);
  assert.equal(aggregate.vehiclesConsidered, 2);
  assert.equal(aggregate.vehiclesAlreadyCompleted, 1);
  assert.equal(aggregate.partialVehicles, 1);
  assert.equal(aggregate.estimatedRemainingWindows, 2);
  assert.equal(aggregate.providerRequests, 0);
  assert.equal(aggregate.inserted, 0);
  assert.equal(aggregate.stoppedByBudget, true);
});

test("duplicate fixes remain harmless in fleet aggregates and deterministic rerun skips newly completed targets", async () => {
  let completed = false;
  const repository: PositionHistoryFleetBackfillRepository = {
    inspect: async () => [vehicle(0, { checkpoint: completed ? { nextFrom: target.to, status: PositionBackfillStatus.COMPLETED } : null })],
  };
  let calls = 0;
  const engine = { run: async () => { calls += 1; completed = true; return result({ historyInserted: 0, historyDuplicates: 1 }); } } as unknown as PositionHistoryBackfillService;
  const service = new PositionHistoryFleetBackfillService(engine, repository);
  const first = await service.run(target);
  const second = await service.run(target);
  assert.equal(first.inserted, 0);
  assert.equal(first.duplicates, 1);
  assert.equal(calls, 1);
  assert.equal(second.providerRequests, 0);
  assert.equal(second.vehiclesAlreadyCompleted, 1);
});

test("rejects invalid target and budget boundaries before repository access", async () => {
  const item = harness([vehicle(0)]);
  for (const [badTarget, options] of [
    [{ from, to: from }, {}],
    [{ from, to: new Date(from.getTime() + 7 * 24 * hour + 1) }, {}],
    [target, { maxVehicles: 0 }],
    [target, { maxWindows: 0 }],
    [target, { maxWindows: Number.MAX_SAFE_INTEGER + 1 }],
  ] as const) await assert.rejects(item.service.run(badTarget, options));
  assert.equal(item.inspections(), 0);
});
