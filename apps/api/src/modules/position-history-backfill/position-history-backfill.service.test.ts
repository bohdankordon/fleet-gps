import assert from "node:assert/strict";
import test from "node:test";
import { EquGpsHttpError, EquGpsRateLimitError, EquGpsTimeoutError, type EquGpsPosition } from "@taxi-gps/equgps";
import { PositionBackfillStatus, PositionIngestionSource } from "../../generated/prisma/client";
import type { EquGpsGatewayService } from "../equgps/equgps-gateway.service";
import { normalizePositionHistoryCandidate } from "../position-history";
import { PositionHistoryBackfillProviderContractError, PositionHistoryBackfillTargetError } from "./position-history-backfill.errors";
import { POSITION_HISTORY_BACKFILL_MAX_ROWS_PER_WINDOW, PositionHistoryBackfillService } from "./position-history-backfill.service";
import type { PositionHistoryBackfillCheckpoint, PositionHistoryBackfillRepository, PositionHistoryBackfillTarget } from "./position-history-backfill.types";

const vehicleId = "123e4567-e89b-42d3-a456-426614174000";
const from = new Date("2026-08-10T00:00:00.000Z");
const target = (hours = 1): PositionHistoryBackfillTarget => ({ vehicleId, from, to: new Date(from.getTime() + hours * 60 * 60 * 1_000) });
const point = (at: string, overrides: Partial<EquGpsPosition> = {}): EquGpsPosition => ({ deviceId: 7, fixTime: at, latitude: 49.2, longitude: 28.4, speedKnots: 10, valid: true, outdated: false, ...overrides });

function harness(options: { checkpoint?: Partial<PositionHistoryBackfillCheckpoint>; responses?: Array<readonly EquGpsPosition[] | Error>; existingFingerprints?: Set<string>; persistenceFailure?: Error; clockValues?: Date[] } = {}) {
  const calls: Array<{ from: string; to: string }> = [];
  const sleeps: number[] = [];
  const persistedSources: PositionIngestionSource[] = [];
  const persistedFetchedAt: Date[] = [];
  let cursor = options.checkpoint?.nextFrom ?? from;
  let status = options.checkpoint?.status ?? PositionBackfillStatus.PENDING;
  let responseIndex = 0;
  const checkpoint = (): PositionHistoryBackfillCheckpoint => ({ id: "checkpoint", vehicleId, externalDeviceId: 7, rangeFrom: from, rangeTo: target(3).to, nextFrom: cursor, status, ...options.checkpoint });
  const gateway = { getHistoricalPositions: async (params: { from: string; to: string }) => { calls.push(params); const response = options.responses?.[responseIndex++] ?? []; if (response instanceof Error) throw response; return response; } } as unknown as EquGpsGatewayService;
  const known = options.existingFingerprints ?? new Set<string>();
  const repository: PositionHistoryBackfillRepository = {
    prepare: async (value) => ({ ...checkpoint(), rangeTo: value.to }),
    persistWindow: async (input) => {
      if (options.persistenceFailure) throw options.persistenceFailure;
      let inserted = 0;
      for (const candidate of input.candidates) {
        persistedSources.push(candidate.ingestionSource);
        persistedFetchedAt.push(candidate.fetchedAt);
        if (!known.has(candidate.fixFingerprint)) { known.add(candidate.fixFingerprint); inserted += 1; }
      }
      cursor = input.nextFrom;
      status = input.completed ? PositionBackfillStatus.COMPLETED : PositionBackfillStatus.RUNNING;
      return { inserted, duplicates: input.candidates.length - inserted };
    },
  };
  let clockIndex = 0;
  const service = new PositionHistoryBackfillService(gateway, repository, { now: () => new Date((options.clockValues?.[clockIndex++] ?? new Date("2026-08-10T12:30:00Z")).getTime()) }, { sleep: async (durationMs) => { sleeps.push(durationMs); } });
  return { service, calls, sleeps, persistedSources, persistedFetchedAt, known, getCursor: () => cursor };
}

test("processes sequential inclusive one-hour windows with deterministic overlap and empty windows", async () => {
  const item = harness({ responses: [
    [point("2026-08-10T00:00:00.000Z"), point("2026-08-10T01:00:00.000Z")],
    [point("2026-08-10T01:00:00.000Z"), point("2026-08-10T02:00:00.000Z", { valid: false, outdated: true })],
    [],
  ] });
  const result = await item.service.run(target(3));
  assert.deepEqual(item.calls, [
    { deviceId: 7, from: "2026-08-10T00:00:00.000Z", to: "2026-08-10T01:00:00.000Z" },
    { deviceId: 7, from: "2026-08-10T01:00:00.000Z", to: "2026-08-10T02:00:00.000Z" },
    { deviceId: 7, from: "2026-08-10T02:00:00.000Z", to: "2026-08-10T03:00:00.000Z" },
  ]);
  assert.deepEqual(item.sleeps, [500, 500]);
  assert.equal(result.providerRows, 4);
  assert.equal(result.historyCandidates, 4);
  assert.equal(result.historyInserted, 3);
  assert.equal(result.historyDuplicates, 1);
  assert.equal(result.windowsCompleted, 3);
  assert.equal(item.persistedSources.every((source) => source === PositionIngestionSource.HISTORICAL_BACKFILL), true);
});

test("completed replay performs zero provider calls and resume starts at the durable cursor", async () => {
  const completed = harness({ checkpoint: { status: PositionBackfillStatus.COMPLETED, nextFrom: target(2).to } });
  assert.equal((await completed.service.run(target(2))).alreadyCompleted, true);
  assert.equal(completed.calls.length, 0);

  const resumed = harness({ checkpoint: { status: PositionBackfillStatus.RUNNING, nextFrom: new Date("2026-08-10T01:00:00Z") }, responses: [[]] });
  const result = await resumed.service.run(target(2));
  assert.equal(result.resumed, true);
  assert.equal(resumed.calls[0]?.from, "2026-08-10T01:00:00.000Z");
  assert.equal(resumed.calls.length, 1);
});

test("clean max-window pause persists progress and a second invocation resumes without refetching completed windows", async () => {
  const item = harness({ responses: [[], [], []] });
  const paused = await item.service.run(target(3), { maxWindows: 1 });
  assert.equal(paused.completed, false);
  assert.equal(paused.windowsCompleted, 1);
  assert.equal(item.calls.length, 1);
  const resumed = await item.service.run(target(3));
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.completed, true);
  assert.equal(item.calls.length, 3);
  assert.deepEqual(item.calls.map((call) => call.from), ["2026-08-10T00:00:00.000Z", "2026-08-10T01:00:00.000Z", "2026-08-10T02:00:00.000Z"]);
});

test("cross-source and overlapping historical fixes use one shared fingerprint identity", async () => {
  const existingFleetFix = normalizePositionHistoryCandidate({ observedAt: new Date("2026-08-10T00:30:00Z"), latitude: 49.2, longitude: 28.4, speedKph: 18.52, valid: false, outdated: true, fetchedAt: new Date("2026-08-10T00:31:00Z"), ingestionSource: PositionIngestionSource.FLEET_SYNC })!;
  const replay = harness({ responses: [[point("2026-08-10T00:30:00Z")]], existingFingerprints: new Set([existingFleetFix.fixFingerprint]) });
  const duplicate = await replay.service.run(target());
  assert.equal(duplicate.historyInserted, 0);
  assert.equal(duplicate.historyDuplicates, 1);
});

test("skips invalid coordinate/time, nulls invalid speed, and preserves valid=false quality", async () => {
  const item = harness({ responses: [[
    point("2026-08-10T00:10:00Z", { latitude: 91 }),
    point("invalid"),
    point("2026-08-10T00:20:00Z", { speedKnots: -1, valid: false, outdated: true }),
  ]] });
  const result = await item.service.run(target());
  assert.equal(result.historySkippedInvalid, 2);
  assert.equal(result.historyCandidates, 1);
  assert.equal(result.historyInserted, 1);
});

test("rejects oversized, wrong-device, and out-of-window provider responses without advancing", async () => {
  for (const response of [
    Array.from({ length: POSITION_HISTORY_BACKFILL_MAX_ROWS_PER_WINDOW + 1 }, () => point("2026-08-10T00:10:00Z")),
    [point("2026-08-10T00:10:00Z", { deviceId: 8 })],
    [point("2026-08-10T01:00:00.001Z")],
  ]) {
    const item = harness({ responses: [response] });
    await assert.rejects(item.service.run(target()), PositionHistoryBackfillProviderContractError);
    assert.equal(item.getCursor().toISOString(), from.toISOString());
  }
});

test("retries only transient provider failures and honors Retry-After", async () => {
  const item = harness({
    responses: [new EquGpsRateLimitError("getHistoricalPositions", 1_500), new EquGpsHttpError(503, "getHistoricalPositions"), [point("2026-08-10T00:10:00Z")]],
    clockValues: [new Date("2026-08-10T12:00:00Z"), new Date("2026-08-10T12:00:01Z"), new Date("2026-08-10T12:00:02Z")],
  });
  const result = await item.service.run(target());
  assert.equal(result.requests, 3);
  assert.equal(result.retries, 2);
  assert.equal(result.rateLimitResponses, 1);
  assert.deepEqual(item.sleeps, [1_500, 2_000]);
  assert.equal(item.persistedFetchedAt[0]?.toISOString(), "2026-08-10T12:00:02.000Z");

  const permanent = harness({ responses: [new EquGpsHttpError(400, "getHistoricalPositions")] });
  await assert.rejects(permanent.service.run(target()), EquGpsHttpError);
  assert.equal(permanent.calls.length, 1);

  const exhausted = harness({ responses: [new EquGpsTimeoutError("getHistoricalPositions"), new EquGpsTimeoutError("getHistoricalPositions"), new EquGpsTimeoutError("getHistoricalPositions")] });
  await assert.rejects(exhausted.service.run(target()), EquGpsTimeoutError);
  assert.equal(exhausted.calls.length, 3);
});

test("provider success followed by database failure does not retry or advance checkpoint", async () => {
  const failure = new Error("database write failed");
  const item = harness({ responses: [[point("2026-08-10T00:10:00Z")]], persistenceFailure: failure });
  await assert.rejects(item.service.run(target()), (error) => error === failure);
  assert.equal(item.calls.length, 1);
  assert.equal(item.getCursor().toISOString(), from.toISOString());
});

test("validates public UUID, finite non-empty range, and seven-day command bound before provider work", async () => {
  const item = harness();
  for (const value of [
    { ...target(), vehicleId: "invalid" },
    { ...target(), to: from },
    { ...target(), from: new Date("invalid") },
    target(24 * 7 + 1),
  ]) await assert.rejects(item.service.run(value), PositionHistoryBackfillTargetError);
  assert.equal(item.calls.length, 0);
});
