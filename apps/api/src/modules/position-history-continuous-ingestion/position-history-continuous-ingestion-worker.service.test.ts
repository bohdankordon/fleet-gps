import assert from "node:assert/strict";
import test from "node:test";
import { EquGpsHttpError, EquGpsNetworkError, EquGpsRateLimitError, EquGpsResponseValidationError, EquGpsTimeoutError } from "@taxi-gps/equgps";
import { PositionIngestionSource } from "../../generated/prisma/client";
import { normalizePositionHistoryCandidate, type PositionHistoryCandidate } from "../position-history";
import { PositionHistoryBackfillProviderContractError, type PositionHistoryHistoricalWindowReadOptions, type PositionHistoryHistoricalWindowRequest } from "../position-history-historical-window";
import type { PositionHistoryHistoricalWindowService } from "../position-history-historical-window";
import { PositionHistoryIngestionCursorStaleProgressError, type VehicleHistoryIngestionCursor } from "../position-history-ingestion-cursor";
import type { PositionHistoryIngestionCursorService } from "../position-history-ingestion-cursor";
import { positionHistoryPolicyFloor } from "../position-history-horizon/position-history-policy-floor";
import { PositionHistoryHorizonAlreadyRunningError, type PositionHistoryHorizonExecutionLockService } from "../position-history-horizon-execution/position-history-horizon-execution-lock.service";
import { POSITION_HISTORY_CONTINUOUS_CAUGHT_UP_CADENCE_MS, POSITION_HISTORY_CONTINUOUS_FAILURE_BACKOFF_MS, POSITION_HISTORY_CONTINUOUS_MIN_REQUEST_START_GAP_MS, POSITION_HISTORY_CONTINUOUS_PROVIDER_BLOCKED_CADENCE_MS, POSITION_HISTORY_CONTINUOUS_REQUESTS_PER_MINUTE, POSITION_HISTORY_CONTINUOUS_REQUEST_START_GAP_MS } from "./position-history-continuous-ingestion.constants";
import type { PositionHistoryContinuousIngestionRepository, PositionHistoryContinuousVehicle } from "./position-history-continuous-ingestion.types";
import { PositionHistoryContinuousIngestionWorkerService } from "./position-history-continuous-ingestion-worker.service";

const ids = ["123e4567-e89b-42d3-a456-426614174001", "123e4567-e89b-42d3-a456-426614174002", "123e4567-e89b-42d3-a456-426614174003"] as const;
const baseNow = new Date("2026-09-13T12:00:00Z");
const safeNow = new Date("2026-09-13T11:58:00Z");

function candidate(at: string, latitude: number): PositionHistoryCandidate {
  return normalizePositionHistoryCandidate({ observedAt: new Date(at), latitude, longitude: 28.4, speedKph: 10, valid: true, outdated: false, fetchedAt: baseNow, ingestionSource: PositionIngestionSource.HISTORICAL_BACKFILL })!;
}

type Handler = (request: PositionHistoryHistoricalWindowRequest, options: PositionHistoryHistoricalWindowReadOptions) => Promise<readonly PositionHistoryCandidate[]>;

function harness(input: { vehicles?: readonly PositionHistoryContinuousVehicle[]; cursors?: ReadonlyMap<string, Date>; handler?: Handler; lockAvailable?: boolean; persistFailure?: Error } = {}) {
  let clockMs = baseNow.getTime();
  const sleeps: number[] = [];
  const calls: PositionHistoryHistoricalWindowRequest[] = [];
  const ensuredAt: Date[] = [];
  const observations = new Map<string, Set<string>>();
  const cursors = new Map<string, VehicleHistoryIngestionCursor>();
  const vehicles = input.vehicles ?? [{ vehicleId: ids[0], externalDeviceId: 1, disabled: false }];
  for (const vehicle of vehicles) {
    const confirmed = input.cursors?.get(vehicle.vehicleId);
    if (confirmed !== undefined) cursors.set(vehicle.vehicleId, { vehicleId: vehicle.vehicleId, coverageFrom: new Date("2026-06-15T02:00:00Z"), confirmedThrough: new Date(confirmed), createdAt: baseNow, updatedAt: baseNow });
    observations.set(vehicle.vehicleId, new Set());
  }
  const repository: PositionHistoryContinuousIngestionRepository = {
    listMappedVehicles: async () => vehicles,
    persistReplay: async (vehicleId, values) => {
      if (input.persistFailure !== undefined) throw input.persistFailure;
      const set = observations.get(vehicleId)!; let inserted = 0;
      for (const value of values) if (!set.has(value.fixFingerprint)) { set.add(value.fixFingerprint); inserted += 1; }
      return { inserted, duplicates: values.length - inserted };
    },
  };
  const cursorService = {
    ensureCursor: async (vehicleId: string, now: Date) => {
      ensuredAt.push(new Date(now));
      const existing = cursors.get(vehicleId);
      if (existing !== undefined) return existing;
      const floor = positionHistoryPolicyFloor(now);
      const created = { vehicleId, coverageFrom: floor, confirmedThrough: floor, createdAt: now, updatedAt: now };
      cursors.set(vehicleId, created);
      return created;
    },
    findCursor: async (vehicleId: string) => cursors.get(vehicleId) ?? null,
    persistContiguousResult: async ({ vehicleId, expectedCoverageFrom, expectedConfirmedThrough, nextConfirmedThrough, candidates }: { vehicleId: string; expectedCoverageFrom: Date; expectedConfirmedThrough: Date; nextConfirmedThrough: Date; candidates: readonly PositionHistoryCandidate[] }) => {
      if (input.persistFailure !== undefined) throw input.persistFailure;
      const current = cursors.get(vehicleId)!;
      if (current.coverageFrom.getTime() !== expectedCoverageFrom.getTime() || current.confirmedThrough.getTime() !== expectedConfirmedThrough.getTime()) throw new PositionHistoryIngestionCursorStaleProgressError();
      const set = observations.get(vehicleId)!; let inserted = 0;
      for (const value of candidates) if (!set.has(value.fixFingerprint)) { set.add(value.fixFingerprint); inserted += 1; }
      cursors.set(vehicleId, { ...current, confirmedThrough: new Date(nextConfirmedThrough), updatedAt: new Date(clockMs) });
      return { inserted, duplicates: candidates.length - inserted };
    },
  } as unknown as PositionHistoryIngestionCursorService;
  const handler = input.handler ?? (async () => []);
  const historicalWindow = { read: async (request: PositionHistoryHistoricalWindowRequest, options: PositionHistoryHistoricalWindowReadOptions = {}) => {
    calls.push(request);
    await options.beforeRequestStart?.();
    const values = await handler(request, options);
    return { fetchFrom: request.from, fetchTo: request.to, fetchedAt: new Date(clockMs), providerRows: values.length, candidates: values, skippedInvalid: 0, requests: 1, retries: 0, rateLimitResponses: 0 };
  } } as PositionHistoryHistoricalWindowService;
  const lock = { runExclusive: async <T>(execute: () => Promise<T>) => {
    if (input.lockAvailable === false) throw new PositionHistoryHorizonAlreadyRunningError();
    return execute();
  } } as PositionHistoryHorizonExecutionLockService;
  const worker = new PositionHistoryContinuousIngestionWorkerService(repository, cursorService, historicalWindow, lock, { now: () => new Date(clockMs) }, { sleep: async (milliseconds) => { sleeps.push(milliseconds); clockMs += milliseconds; } });
  return { worker, calls, sleeps, ensuredAt, cursors, observations, advance: (milliseconds: number) => { clockMs += milliseconds; } };
}

test("missing and disabled mapped vehicles receive conservative floor cursors, never latest-derived completeness", async () => {
  const item = harness({ vehicles: [{ vehicleId: ids[0], externalDeviceId: 1, disabled: false }, { vehicleId: ids[1], externalDeviceId: 2, disabled: true }], lockAvailable: false });
  await item.worker.processCycle();
  for (const id of [ids[0], ids[1]]) {
    const cursor = item.cursors.get(id)!;
    assert.equal(cursor.coverageFrom.toISOString(), positionHistoryPolicyFloor(baseNow).toISOString());
    assert.equal(cursor.confirmedThrough.toISOString(), cursor.coverageFrom.toISOString());
  }
  assert.equal(item.ensuredAt.every((value) => value.toISOString() === baseNow.toISOString()), true);
});

test("safeNow is clock minus two minutes and long backlog schedules recent then contiguous work", async () => {
  const item = harness({ cursors: new Map([[ids[0], new Date("2026-09-01T01:00:00Z")]]) });
  const result = await item.worker.processCycle();
  assert.equal(item.calls[0]?.from.toISOString(), "2026-09-13T11:43:00.000Z");
  assert.equal(item.calls[0]?.to.toISOString(), safeNow.toISOString());
  assert.equal(item.calls[1]?.from.toISOString(), "2026-09-01T00:45:00.000Z");
  assert.equal(item.calls[1]?.to.toISOString(), "2026-09-01T01:45:00.000Z");
  assert.equal(result.recentTailCompleted, 1);
  assert.equal(result.backlogCompleted, 1);
  assert.equal(item.cursors.get(ids[0])?.confirmedThrough.toISOString(), "2026-09-01T01:45:00.000Z");
});

test("recent tail inserts and deduplicates without jumping an old contiguous cursor", async () => {
  const value = candidate("2026-09-13T11:50:00Z", 49.2);
  const item = harness({ cursors: new Map([[ids[0], new Date("2026-09-01T01:00:00Z")]]), handler: async (request) => request.from.getTime() > new Date("2026-09-10T00:00:00Z").getTime() ? [value] : [] });
  await item.worker.processCycle();
  assert.equal(item.observations.get(ids[0])?.has(value.fixFingerprint), true);
  assert.equal(item.cursors.get(ids[0])?.confirmedThrough.toISOString(), "2026-09-01T01:45:00.000Z");
  item.advance(POSITION_HISTORY_CONTINUOUS_CAUGHT_UP_CADENCE_MS);
  const replay = await item.worker.processCycle();
  assert.ok(replay.duplicates >= 1);
});

test("caught-up work proves A/B/C/D once and uses backlog only without redundant recent-tail request", async () => {
  const values = [candidate("2026-09-13T11:40:00Z", 49.1), candidate("2026-09-13T11:45:00Z", 49.2), candidate("2026-09-13T11:50:00Z", 49.3), candidate("2026-09-13T11:55:00Z", 49.4)];
  const item = harness({ cursors: new Map([[ids[0], new Date("2026-09-13T11:45:00Z")]]), handler: async () => values });
  item.observations.get(ids[0])!.add(values[0]!.fixFingerprint);
  item.observations.get(ids[0])!.add(values[3]!.fixFingerprint);
  const result = await item.worker.processCycle();
  assert.equal(item.calls.length, 1);
  assert.deepEqual({ inserted: result.inserted, duplicates: result.duplicates }, { inserted: 2, duplicates: 2 });
  assert.equal(item.observations.get(ids[0])?.size, 4);
  assert.equal(item.cursors.get(ids[0])?.confirmedThrough.toISOString(), safeNow.toISOString());
});

test("fleet and lane opportunities are deterministic and no vehicle consumes all four slots", async () => {
  const vehicles = ids.map((vehicleId, index) => ({ vehicleId, externalDeviceId: index + 1, disabled: false }));
  const old = new Map(ids.map((id) => [id, new Date("2026-09-01T01:00:00Z")]));
  const item = harness({ vehicles, cursors: old });
  const result = await item.worker.processCycle();
  assert.deepEqual(item.calls.map(({ externalDeviceId }) => externalDeviceId), [1, 1, 2, 2]);
  assert.deepEqual({ recent: result.recentTailCompleted, backlog: result.backlogCompleted }, { recent: 2, backlog: 2 });
});

test("one failing vehicle is delayed without blocking another vehicle's opportunities", async () => {
  const vehicles = [{ vehicleId: ids[0], externalDeviceId: 1, disabled: false }, { vehicleId: ids[1], externalDeviceId: 2, disabled: false }];
  const item = harness({ vehicles, cursors: new Map(ids.slice(0, 2).map((id) => [id, new Date("2026-09-01T01:00:00Z")])), handler: async (request) => { if (request.externalDeviceId === 1) throw new EquGpsNetworkError("getHistoricalPositions"); return []; } });
  const result = await item.worker.processCycle();
  assert.ok(result.failedWork >= 1);
  assert.ok(item.calls.some(({ externalDeviceId }) => externalDeviceId === 2));
});

test("restart with a persisted lagging cursor naturally resumes without user action", async () => {
  const persisted = new Map([[ids[0], new Date("2026-09-13T10:00:00Z")]]);
  const first = harness({ cursors: persisted });
  await first.worker.processCycle();
  const resumedAt = first.cursors.get(ids[0])!.confirmedThrough;
  const restarted = harness({ cursors: new Map([[ids[0], resumedAt]]) });
  await restarted.worker.processCycle();
  assert.ok(restarted.calls.some(({ from }) => from.getTime() <= resumedAt.getTime()));
  assert.ok(restarted.cursors.get(ids[0])!.confirmedThrough > resumedAt);
});

for (const [label, failure] of [["timeout", new EquGpsTimeoutError("getHistoricalPositions")], ["network", new EquGpsNetworkError("getHistoricalPositions")], ["5xx", new EquGpsHttpError(503, "getHistoricalPositions")], ["malformed", new EquGpsResponseValidationError("getHistoricalPositions", "unexpected_response_shape")], ["oversized", new PositionHistoryBackfillProviderContractError()]] as const) {
  test(`${label} failure leaves progress unchanged and outer-backoff prevents an immediate repeat`, async () => {
    const initial = new Date("2026-09-13T11:35:00Z");
    const item = harness({ cursors: new Map([[ids[0], initial]]), handler: async () => { throw failure; } });
    const failed = await item.worker.processCycle();
    const calls = item.calls.length;
    assert.equal(failed.failedWork, 1);
    assert.equal(item.cursors.get(ids[0])?.confirmedThrough.toISOString(), initial.toISOString());
    await item.worker.processCycle();
    assert.equal(item.calls.length, calls);
  });
}

test("exhausted 429 cools the fleet and leaves the cursor unchanged", async () => {
  const initial = new Date("2026-09-13T11:35:00Z");
  const item = harness({ cursors: new Map([[ids[0], initial]]), handler: async () => { throw new EquGpsRateLimitError("getHistoricalPositions", null); } });
  const result = await item.worker.processCycle();
  assert.equal(result.rateLimitResponses, 1);
  assert.equal(item.cursors.get(ids[0])?.confirmedThrough.toISOString(), initial.toISOString());
  const calls = item.calls.length;
  await item.worker.processCycle();
  assert.equal(item.calls.length, calls);
});

test("stable 400 is provider-blocked for six hours and never advances", async () => {
  const initial = new Date("2026-09-13T11:35:00Z");
  const item = harness({ cursors: new Map([[ids[0], initial]]), handler: async () => { throw new EquGpsHttpError(400, "getHistoricalPositions"); } });
  const result = await item.worker.processCycle();
  assert.equal(result.providerBlocked, 1);
  const calls = item.calls.length;
  item.advance(POSITION_HISTORY_CONTINUOUS_CAUGHT_UP_CADENCE_MS);
  await item.worker.processCycle();
  assert.equal(item.calls.length, calls);
  assert.equal(item.cursors.get(ids[0])?.confirmedThrough.toISOString(), initial.toISOString());
});

test("disabled mapped vehicle gets only low-frequency contiguous diagnostic opportunity", async () => {
  const item = harness({ vehicles: [{ vehicleId: ids[0], externalDeviceId: 1, disabled: true }], cursors: new Map([[ids[0], new Date("2026-09-13T11:35:00Z")]]) });
  const first = await item.worker.processCycle();
  assert.deepEqual({ recent: first.recentTailCompleted, backlog: first.backlogCompleted }, { recent: 0, backlog: 1 });
  const calls = item.calls.length;
  item.advance(POSITION_HISTORY_CONTINUOUS_CAUGHT_UP_CADENCE_MS);
  await item.worker.processCycle();
  assert.equal(item.calls.length, calls);
});

test("backlog yields without provider traffic while its durable coverage floor trails current retention policy", async () => {
  const item = harness({ vehicles: [{ vehicleId: ids[0], externalDeviceId: 1, disabled: true }], cursors: new Map([[ids[0], new Date("2026-06-05T02:00:00Z")]]) });
  const current = item.cursors.get(ids[0])!;
  item.cursors.set(ids[0], { ...current, coverageFrom: new Date("2026-06-01T02:00:00Z") });
  const result = await item.worker.processCycle();
  assert.equal(result.requests, 0);
  assert.equal(result.backlogCompleted, 0);
  assert.equal(item.calls.length, 0);
});

for (const [label, failure] of [["database", new Error("database")], ["stale CAS", new PositionHistoryIngestionCursorStaleProgressError()]] as const) {
  test(`${label} persistence failure leaves cursor unchanged and work retryable`, async () => {
    const initial = new Date("2026-09-13T11:35:00Z");
    const item = harness({ cursors: new Map([[ids[0], initial]]), persistFailure: failure });
    const result = await item.worker.processCycle();
    assert.ok(result.failedWork >= 1);
    assert.equal(item.cursors.get(ids[0])?.confirmedThrough.toISOString(), initial.toISOString());
  });
}

test("retention changing coverageFrom after planning fences stale inserts and replans from the new floor", async () => {
  const confirmed = new Date("2026-09-13T11:45:00Z");
  const newFloor = new Date("2026-09-13T11:44:00Z");
  const value = candidate("2026-09-13T11:50:00Z", 49.31);
  let item: ReturnType<typeof harness>;
  let moved = false;
  item = harness({ cursors: new Map([[ids[0], confirmed]]), handler: async () => {
    if (!moved) {
      moved = true;
      const current = item.cursors.get(ids[0])!;
      item.cursors.set(ids[0], { ...current, coverageFrom: newFloor });
    }
    return [value];
  } });
  const stale = await item.worker.processCycle();
  assert.equal(stale.failedWork, 1);
  assert.equal(item.observations.get(ids[0])?.has(value.fixFingerprint), false);
  assert.equal(item.cursors.get(ids[0])?.confirmedThrough.toISOString(), confirmed.toISOString());

  item.advance(POSITION_HISTORY_CONTINUOUS_FAILURE_BACKOFF_MS[0]);
  const refreshed = await item.worker.processCycle();
  assert.equal(refreshed.backlogCompleted, 1);
  assert.ok(item.calls.at(-1)!.from.getTime() >= newFloor.getTime());
});

test("valid empty contiguous range advances while empty recent tail only inserts nothing", async () => {
  const old = harness({ cursors: new Map([[ids[0], new Date("2026-09-01T01:00:00Z")]]) });
  const result = await old.worker.processCycle();
  assert.deepEqual({ recent: result.recentTailCompleted, backlog: result.backlogCompleted, inserted: result.inserted }, { recent: 1, backlog: 1, inserted: 0 });
  assert.equal(old.cursors.get(ids[0])?.confirmedThrough.toISOString(), "2026-09-01T01:45:00.000Z");
});

test("lock unavailability performs no provider request and remains eligible", async () => {
  const item = harness({ cursors: new Map([[ids[0], new Date("2026-09-01T01:00:00Z")]]), lockAvailable: false });
  const result = await item.worker.processCycle();
  assert.equal(result.lockUnavailable, 2);
  assert.equal(item.calls.length, 0);
});

test("shared budget bounds a cycle to four requests, concurrency one, and request starts at least two seconds apart", async () => {
  let active = 0; let maximum = 0;
  const vehicles = ids.map((vehicleId, index) => ({ vehicleId, externalDeviceId: index + 1, disabled: false }));
  const item = harness({ vehicles, cursors: new Map(ids.map((id) => [id, new Date("2026-09-01T01:00:00Z")])), handler: async () => { active += 1; maximum = Math.max(maximum, active); await Promise.resolve(); active -= 1; return []; } });
  const result = await item.worker.processCycle();
  assert.equal(result.requests, 4);
  assert.equal(item.calls.length, 4);
  assert.equal(maximum, 1);
  assert.equal(item.sleeps.every((value) => value >= 2_000), true);
  assert.ok(POSITION_HISTORY_CONTINUOUS_REQUEST_START_GAP_MS >= POSITION_HISTORY_CONTINUOUS_MIN_REQUEST_START_GAP_MS);
  assert.equal(60_000 / POSITION_HISTORY_CONTINUOUS_REQUEST_START_GAP_MS, POSITION_HISTORY_CONTINUOUS_REQUESTS_PER_MINUTE);
});
