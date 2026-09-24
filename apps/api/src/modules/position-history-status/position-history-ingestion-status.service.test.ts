import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryReplayKind } from "../../generated/prisma/client";
import { EquGpsTimeoutError } from "@taxi-gps/equgps";
import type { ApiConfig } from "../../config/api-config";
import { PositionHistoryIngestionTelemetryService } from "../position-history-horizon-execution/position-history-ingestion-telemetry.service";
import { estimatedReplayRemainingWindows, replayProgress, PositionHistoryIngestionStatusService, summarizeCursorLag } from "./position-history-ingestion-status.service";

function telemetry() {
  return new PositionHistoryIngestionTelemetryService({ now: () => new Date("2026-09-14T12:00:00Z") });
}

function config(continuous: boolean, retention: boolean): ApiConfig {
  return { positionHistoryContinuousIngestion: { enabled: continuous }, positionHistoryRetention: { enabled: retention } } as ApiConfig;
}

function database(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const client: any = {
    vehicle: { count: async (): Promise<number> => { calls.push("vehicle.count"); return 2; } },
    vehicleHistoryIngestionCursor: { findMany: async (): Promise<readonly { confirmedThrough: Date }[]> => { calls.push("cursor.findMany"); return []; } },
    positionHistoryReplayRun: { findFirst: async (): Promise<null> => { calls.push("replay.findFirst"); return null; }, findMany: async (): Promise<readonly unknown[]> => { calls.push("replay.findMany"); return []; } },
    positionHistoryReplayCheckpoint: { count: async (): Promise<number> => { calls.push("replay.count"); return 0; } },
    positionHistoryPopulationRun: { findFirst: async (): Promise<null> => { calls.push("population.findFirst"); return null; } },
    ...overrides,
  };
  const service = { getClient: (): unknown => client } as any;
  return { service, client, calls };
}

test("cursor lag aggregates handle zero, caught-up, mixed, median, worst, missing, and oldest", () => {
  const boundary = new Date("2026-09-14T12:00:00Z");
  const zero = summarizeCursorLag([], 0, boundary);
  assert.deepEqual([zero.mappedVehicles, zero.cursorCount, zero.missingCursorCount, zero.medianLagSeconds, zero.worstLagSeconds, zero.oldestConfirmedThrough], [0, 0, 0, null, null, null]);
  const caught = summarizeCursorLag([{ confirmedThrough: boundary }], 1, boundary);
  assert.deepEqual([caught.medianLagSeconds, caught.worstLagSeconds, caught.missingCursorCount], [0, 0, 0]);
  assert.equal(caught.oldestConfirmedThrough?.toISOString(), boundary.toISOString());
  const mixed = summarizeCursorLag(
    [{ confirmedThrough: new Date("2026-09-14T11:00:00Z") }, { confirmedThrough: new Date("2026-09-14T10:00:00Z") }, { confirmedThrough: new Date(boundary.getTime() + 60_000) }],
    4,
    boundary,
  );
  assert.equal(mixed.cursorCount, 3);
  assert.equal(mixed.missingCursorCount, 1);
  assert.equal(mixed.worstLagSeconds, 7200);
  assert.equal(mixed.medianLagSeconds, 3600);
  assert.equal(mixed.oldestConfirmedThrough?.toISOString(), "2026-09-14T10:00:00.000Z");
  const even = summarizeCursorLag([{ confirmedThrough: new Date("2026-09-14T11:59:00Z") }, { confirmedThrough: new Date("2026-09-14T11:57:00Z") }], 2, boundary);
  assert.equal(even.medianLagSeconds, 120);
});

test("replay progress derives totals, remaining, and percent without writes", () => {
  assert.deepEqual(replayProgress(0, 0), { completed: 0, remaining: 0, progressPercent: null });
  assert.deepEqual(replayProgress(4, 1), { completed: 3, remaining: 1, progressPercent: 75 });
  assert.deepEqual(replayProgress(2, 0), { completed: 2, remaining: 0, progressPercent: 100 });
});
test("remaining windows conservatively ceil each durable incomplete range", () => {
  assert.equal(estimatedReplayRemainingWindows([
    { nextFrom: new Date("2026-09-01T00:00Z"), rangeTo: new Date("2026-09-01T04:00Z") },
    { nextFrom: new Date("2026-09-01T00:00Z"), rangeTo: new Date("2026-09-01T07:00Z") },
  ]), 3);
  assert.equal(estimatedReplayRemainingWindows([]), 0);
});
test("status reports config truthfully and exposes safe boundary deterministically", async () => {
  for (const [continuous, retention] of [[false, false], [false, true], [true, true]] as const) {
    const item = database();
    const service = new PositionHistoryIngestionStatusService(config(continuous, retention), item.service, telemetry());
    const response = await service.inspect(new Date("2026-09-14T12:00:00Z"));
    assert.equal(response.configuration.continuousIngestionEnabled, continuous);
    assert.equal(response.configuration.automaticRetentionEnabled, retention);
    assert.equal(response.cursor.currentSafeBoundary, "2026-09-14T11:58:00.000Z");
    assert.equal(response.generatedAt, "2026-09-14T12:00:00.000Z");
  }
});

test("replay empty, incomplete, and completed states are truthful without creating work", async () => {
  const emptyDb = database();
  const emptyService = new PositionHistoryIngestionStatusService(config(false, false), emptyDb.service, telemetry());
  const empty = await emptyService.inspect(new Date("2026-09-14T12:00:00Z"));
  assert.equal(empty.replay.daily.state, "NOT_CREATED");
  assert.equal(empty.replay.daily.generationAnchor, null);
  assert.equal(empty.replay.daily.progressPercent, null);
  assert.equal(empty.replay.rolling.state, "NOT_CREATED");
  assert.deepEqual(emptyDb.calls.filter((call) => call.startsWith("replay.")), ["replay.findFirst", "replay.findFirst"]);
  const anchor = new Date("2026-09-14T02:00:00Z");
  const activeDb = database({
    positionHistoryReplayRun: { findFirst: async (args: any): Promise<any> => (args.where.kind === PositionHistoryReplayKind.DAILY_7_DAY ? { id: "run-daily", generationAnchor: anchor, rangeFrom: new Date("2026-09-07T02:00:00Z"), rangeTo: anchor, status: "RUNNING" } : null), findMany: async (): Promise<readonly unknown[]> => [] },
    positionHistoryReplayCheckpoint: { count: async (args: any): Promise<number> => (args.where?.status === undefined ? 4 : 1) },
  });
  const active = await new PositionHistoryIngestionStatusService(config(true, true), activeDb.service, telemetry()).inspect(new Date("2026-09-14T12:00:00Z"));
  assert.equal(active.replay.daily.state, "RUNNING");
  assert.equal(active.replay.daily.generationAnchor, anchor.toISOString());
  assert.equal(active.replay.daily.checkpointsTotal, 4);
  assert.equal(active.replay.daily.checkpointsCompleted, 3);
  assert.equal(active.replay.daily.checkpointsRemaining, 1);
  assert.equal(active.replay.daily.progressPercent, 75);
  const completedDb = database({
    positionHistoryReplayRun: { findFirst: async (): Promise<any> => ({ id: "run-daily", generationAnchor: anchor, rangeFrom: new Date("2026-09-07T02:00:00Z"), rangeTo: anchor, status: "COMPLETED" }), findMany: async (): Promise<readonly unknown[]> => [] },
    positionHistoryReplayCheckpoint: { count: async (args: any): Promise<number> => (args.where?.status === undefined ? 2 : 0) },
  });
  const completed = await new PositionHistoryIngestionStatusService(config(true, true), completedDb.service, telemetry()).inspect(new Date("2026-09-14T12:00:00Z"));
  assert.equal(completed.replay.daily.state, "COMPLETED");
  assert.equal(completed.replay.daily.checkpointsRemaining, 0);
  assert.equal(completed.replay.daily.progressPercent, 100);
  assert.equal(completed.replay.daily.debtSuspected, false);
  assert.equal(completed.replay.daily.estimatedRemainingWindows, 0);
});

test("latest 0/0 and oldest incomplete progress and range are distinct durable facts", async () => {
  const oldAnchor = new Date("2026-09-01T02:00:00Z");
  const latestAnchor = new Date("2026-09-08T02:00:00Z");
  const run = (id: string, generationAnchor: Date) => ({ id, generationAnchor, rangeFrom: new Date(generationAnchor.getTime() - 90 * 86_400_000), rangeTo: generationAnchor, status: "PENDING" });
  const checkpoints = [
    { nextFrom: new Date("2026-09-01T00:00Z"), rangeTo: new Date("2026-09-01T04:00Z") },
    { nextFrom: new Date("2026-09-01T00:00Z"), rangeTo: new Date("2026-09-01T07:00Z") },
  ];
  const db = database({
    positionHistoryReplayRun: {
      findFirst: async (args: any): Promise<any> => args.where.kind === PositionHistoryReplayKind.ROLLING_90_DAY ? run("latest", latestAnchor) : null,
      findMany: async (args: any): Promise<any> => args.where.kind === PositionHistoryReplayKind.ROLLING_90_DAY ? [run("old", oldAnchor), run("latest", latestAnchor)] : [],
    },
    positionHistoryReplayCheckpoint: {
      count: async (args: any): Promise<number> => args.where.runId === "old" ? 3 : 0,
      findMany: async (args: any): Promise<any> => args.where.runId === "old" ? checkpoints : [],
    },
  });
  const summary = (await new PositionHistoryIngestionStatusService(config(true, true), db.service, telemetry()).inspect(new Date("2026-09-14T12:00:00Z"))).replay.rolling;
  assert.deepEqual([summary.checkpointsTotal, summary.checkpointsCompleted, summary.progressPercent], [0, 0, null]);
  assert.deepEqual([summary.oldestIncompleteGenerationAnchor, summary.oldestIncompleteCheckpointsTotal, summary.oldestIncompleteCheckpointsCompleted, summary.oldestIncompleteCheckpointsRemaining, summary.oldestIncompleteProgressPercent], [oldAnchor.toISOString(), 3, 1, 2, 33]);
  assert.deepEqual([summary.oldestIncompleteRangeFrom, summary.oldestIncompleteRangeTo], [run("old", oldAnchor).rangeFrom.toISOString(), oldAnchor.toISOString()]);
  assert.deepEqual([summary.rangeFrom, summary.rangeTo], [run("latest", latestAnchor).rangeFrom.toISOString(), latestAnchor.toISOString()]);
  assert.equal(summary.estimatedRemainingWindows, 3);
  assert.deepEqual([summary.incompleteGenerations, summary.newerIncompleteGenerations, summary.overdueIncompleteGenerations, summary.oldestIncompleteIsOverdue], [2, 1, 1, true]);
});

test("status exposes only normalized last failure and bounded process cycle timing", async () => {
  const tele = telemetry();
  const start = new Date("2026-09-14T11:59:00Z");
  tele.startCycle(start);
  tele.completeCycle(new Date(start.getTime() + 48_000));
  tele.recordProviderFailure(new EquGpsTimeoutError("getHistoricalPositions"), new Date(start.getTime() + 48_000));
  const response = await new PositionHistoryIngestionStatusService(config(true, true), database().service, tele).inspect(new Date("2026-09-14T12:00:00Z"));
  assert.deepEqual([response.runtime.cyclesCompletedSinceProcessStart, response.runtime.lastCycleDurationMs, response.runtime.maxCycleDurationMsSinceProcessStart, response.runtime.cyclesExceedingPollIntervalSinceProcessStart], [1, 48_000, 48_000, 1]);
  assert.equal(response.providerTraffic.lastFailureCategory, "timeout");
  assert.equal(response.providerTraffic.lastFailureAt, "2026-09-14T11:59:48.000Z");
  assert.equal(JSON.stringify(response).includes("getHistoricalPositions"), false);
});

test("status read performs zero writes, zero provider calls, and bounded aggregates only", async () => {
  const written: string[] = [];
  const client: any = {
    vehicle: { count: async (): Promise<number> => 1, create: async (): Promise<never> => { written.push("vehicle.create"); throw new Error("must not write"); } },
    vehicleHistoryIngestionCursor: { findMany: async (): Promise<readonly unknown[]> => [], upsert: async (): Promise<never> => { written.push("cursor.upsert"); throw new Error("must not write"); } },
    positionHistoryReplayRun: { findFirst: async (): Promise<null> => null, upsert: async (): Promise<never> => { written.push("run.upsert"); throw new Error("must not write"); } },
    positionHistoryReplayCheckpoint: { count: async (): Promise<number> => 0, createMany: async (): Promise<never> => { written.push("checkpoint.create"); throw new Error("must not write"); } },
    positionHistoryPopulationRun: { findFirst: async (): Promise<null> => null },
    vehiclePositionObservation: { createMany: async (): Promise<never> => { written.push("observation.create"); throw new Error("must not write"); } },
  };
  const service = new PositionHistoryIngestionStatusService(config(false, false), { getClient: (): unknown => client } as any, telemetry());
  const response = await service.inspect(new Date("2026-09-14T12:00:00Z"));
  assert.equal(written.length, 0);
  assert.equal(response.cursor.mappedVehicles, 1);
  const serialized = JSON.stringify(response);
  for (const forbidden of ["fixFingerprint", "latitude", "longitude", "externalDeviceId", "leaseOwner", "stack", "message"]) assert.equal(serialized.includes(forbidden), false);
});

test("durable population visibility is aggregate-only without lease owner exposure", async () => {
  const inactive = await new PositionHistoryIngestionStatusService(config(false, false), database().service, telemetry()).inspect(new Date("2026-09-14T12:00:00Z"));
  assert.equal(inactive.coordination.durablePopulationActive, false);
  const activeDb = database({ positionHistoryPopulationRun: { findFirst: async (): Promise<any> => ({ id: "run-1" }) } });
  const active = await new PositionHistoryIngestionStatusService(config(false, false), activeDb.service, telemetry()).inspect(new Date("2026-09-14T12:00:00Z"));
  assert.equal(active.coordination.durablePopulationActive, true);
  assert.equal(JSON.stringify(active).includes("leaseOwner"), false);
});
test("runtime, provider traffic, recent-tail, and deadline signals derive safely", async () => {
  const fakeNow = new Date("2026-09-14T12:00:00Z");
  const clockMs = fakeNow.getTime();
  let now = clockMs;
  const tele = new PositionHistoryIngestionTelemetryService({ now: (): Date => new Date(now) });
  tele.markPollerStarted();
  tele.startCycle(new Date(now));
  tele.recordRequestStart(new Date(now));
  tele.recordProviderRetry(1);
  tele.recordRateLimitResponses(1);
  tele.recordRecentTailSuccess(new Date(now));
  const item = database();
  const response = await new PositionHistoryIngestionStatusService(config(true, true), item.service, tele).inspect(new Date(now));
  assert.equal(response.runtime.pollerStarted, true);
  assert.equal(response.runtime.cycleInFlight, true);
  assert.equal(response.runtime.lastCycleStartedAt, fakeNow.toISOString());
  assert.equal(response.providerTraffic.requestStartsSinceProcessStart, 1);
  assert.equal(response.providerTraffic.requestStartsLastMinute, 1);
  assert.equal(response.providerTraffic.retriesSinceProcessStart, 1);
  assert.equal(response.providerTraffic.rateLimitResponsesSinceProcessStart, 1);
  assert.equal(response.recentTail.successesSinceProcessStart, 1);
  assert.equal(response.recentTail.lastSuccessAt, fakeNow.toISOString());
  assert.equal(response.meta.countersResetOnRestart, true);
  assert.ok(response.meta.telemetryScope.includes("process-local"));
});

test("replay debt is suspected only for stale incomplete generations", async () => {
  const currentAnchor = new Date("2026-09-14T02:00:00Z");
  const staleAnchor = new Date("2026-09-13T02:00:00Z");
  const staleDb = database({
    positionHistoryReplayRun: { findFirst: async (): Promise<any> => ({ id: "run-stale", generationAnchor: staleAnchor, rangeFrom: new Date("2026-09-06T02:00:00Z"), rangeTo: staleAnchor, status: "RUNNING" }), findMany: async (): Promise<readonly unknown[]> => [] },
    positionHistoryReplayCheckpoint: { count: async (args: any): Promise<number> => (args.where?.status === undefined ? 3 : 2) },
  });
  const stale = await new PositionHistoryIngestionStatusService(config(true, true), staleDb.service, telemetry()).inspect(new Date("2026-09-14T12:00:00Z"));
  assert.equal(stale.replay.daily.debtSuspected, true);
  assert.equal(stale.replay.daily.isCurrent, false);
  const currentDb = database({
    positionHistoryReplayRun: { findFirst: async (): Promise<any> => ({ id: "run-current", generationAnchor: currentAnchor, rangeFrom: new Date("2026-09-07T02:00:00Z"), rangeTo: currentAnchor, status: "RUNNING" }), findMany: async (): Promise<readonly unknown[]> => [] },
    positionHistoryReplayCheckpoint: { count: async (args: any): Promise<number> => (args.where?.status === undefined ? 3 : 2) },
  });
  const current = await new PositionHistoryIngestionStatusService(config(true, true), currentDb.service, telemetry()).inspect(new Date("2026-09-14T12:00:00Z"));
  assert.equal(current.replay.daily.isCurrent, true);
  assert.equal(current.replay.daily.debtSuspected, false);
});
test("replay debt aggregates distinguish current processing from hidden older debt", async () => {
  const now = new Date("2026-09-14T12:00:00Z");
  const safeBoundary = new Date(now.getTime() - 2 * 60 * 1000);
  const { positionHistoryReplayTarget } = await import("../position-history-continuous-ingestion/position-history-replay-planning");
  const dailyCurrent = positionHistoryReplayTarget(PositionHistoryReplayKind.DAILY_7_DAY, safeBoundary).generationAnchor;
  const rollingCurrent = positionHistoryReplayTarget(PositionHistoryReplayKind.ROLLING_90_DAY, safeBoundary).generationAnchor;
  const dayMs = 24 * 60 * 60 * 1000;
  type Run = { id: string; kind: PositionHistoryReplayKind; generationAnchor: Date; status: string };
  const replayDb = (runs: readonly Run[]) => {
    const byKind = (kind: PositionHistoryReplayKind): Run[] => runs.filter((run) => run.kind === kind);
    const latestOf = (kind: PositionHistoryReplayKind): Run | null => {
      const sorted = [...byKind(kind)].sort((a, b) => b.generationAnchor.getTime() - a.generationAnchor.getTime());
      return sorted[0] ?? null;
    };
    return database({
      positionHistoryReplayRun: {
        findFirst: async (args: any): Promise<any> => {
          const latest = latestOf(args.where.kind);
          return latest === null ? null : { id: latest.id, generationAnchor: latest.generationAnchor, rangeFrom: new Date(latest.generationAnchor.getTime() - dayMs), rangeTo: latest.generationAnchor, status: latest.status };
        },
        findMany: async (args: any): Promise<any> => byKind(args.where.kind).filter((run) => run.status !== "COMPLETED").sort((a, b) => a.generationAnchor.getTime() - b.generationAnchor.getTime()).map((run) => ({ ...run, rangeFrom: new Date(run.generationAnchor.getTime() - dayMs), rangeTo: run.generationAnchor })),
      },
      positionHistoryReplayCheckpoint: { count: async (args: any): Promise<number> => (args.where?.status === undefined ? 2 : 0), findMany: async (): Promise<readonly unknown[]> => [] },
    });
  };
  const kinds = [PositionHistoryReplayKind.DAILY_7_DAY, PositionHistoryReplayKind.ROLLING_90_DAY] as const;
  const summarize = async (runs: readonly Run[]) => new PositionHistoryIngestionStatusService(config(true, true), replayDb(runs).service, telemetry()).inspect(now);
  const empty = await summarize([]);
  for (const kind of kinds) {
    const summary = kind === PositionHistoryReplayKind.DAILY_7_DAY ? empty.replay.daily : empty.replay.rolling;
    assert.equal(summary.state, "NOT_CREATED");
    assert.equal(summary.incompleteGenerations, 0);
    assert.equal(summary.hasReplayDebt, false);
    assert.equal(summary.oldestIncompleteGenerationAnchor, null);
    assert.equal(summary.oldestOverdueGenerationAnchor, null);
  }
  const dailyProcessing = await summarize([{ id: "d-current", kind: PositionHistoryReplayKind.DAILY_7_DAY, generationAnchor: dailyCurrent, status: "RUNNING" }]);
  assert.equal(dailyProcessing.replay.daily.incompleteGenerations, 1);
  assert.equal(dailyProcessing.replay.daily.overdueIncompleteGenerations, 0);
  assert.equal(dailyProcessing.replay.daily.hasReplayDebt, false);
  assert.equal(dailyProcessing.replay.daily.oldestIncompleteGenerationAnchor, dailyCurrent.toISOString());
  const rollingProcessing = await summarize([{ id: "r-current", kind: PositionHistoryReplayKind.ROLLING_90_DAY, generationAnchor: rollingCurrent, status: "RUNNING" }]);
  assert.equal(rollingProcessing.replay.rolling.incompleteGenerations, 1);
  assert.equal(rollingProcessing.replay.rolling.hasReplayDebt, false);
  const oldDaily = new Date(dailyCurrent.getTime() - dayMs);
  const dailyDebt = await summarize([
    { id: "d-old", kind: PositionHistoryReplayKind.DAILY_7_DAY, generationAnchor: oldDaily, status: "RUNNING" },
    { id: "d-current", kind: PositionHistoryReplayKind.DAILY_7_DAY, generationAnchor: dailyCurrent, status: "RUNNING" },
  ]);
  assert.equal(dailyDebt.replay.daily.incompleteGenerations, 2);
  assert.equal(dailyDebt.replay.daily.overdueIncompleteGenerations, 1);
  assert.equal(dailyDebt.replay.daily.hasReplayDebt, true);
  assert.equal(dailyDebt.replay.daily.oldestIncompleteGenerationAnchor, oldDaily.toISOString());
  assert.equal(dailyDebt.replay.daily.oldestOverdueGenerationAnchor, oldDaily.toISOString());
  assert.equal(dailyDebt.replay.daily.generationAnchor, dailyCurrent.toISOString());
  const oldRolling = new Date(rollingCurrent.getTime() - 7 * dayMs);
  const rollingDebt = await summarize([
    { id: "r-old", kind: PositionHistoryReplayKind.ROLLING_90_DAY, generationAnchor: oldRolling, status: "PENDING" },
    { id: "r-current", kind: PositionHistoryReplayKind.ROLLING_90_DAY, generationAnchor: rollingCurrent, status: "RUNNING" },
  ]);
  assert.equal(rollingDebt.replay.rolling.hasReplayDebt, true);
  assert.equal(rollingDebt.replay.rolling.oldestOverdueGenerationAnchor, oldRolling.toISOString());
});
test("replay debt counts several old incomplete generations and ignores completed ones", async () => {
  const now = new Date("2026-09-14T12:00:00Z");
  const safeBoundary = new Date(now.getTime() - 2 * 60 * 1000);
  const { positionHistoryReplayTarget } = await import("../position-history-continuous-ingestion/position-history-replay-planning");
  const dailyCurrent = positionHistoryReplayTarget(PositionHistoryReplayKind.DAILY_7_DAY, safeBoundary).generationAnchor;
  const dayMs = 24 * 60 * 60 * 1000;
  const old1 = new Date(dailyCurrent.getTime() - 3 * dayMs);
  const old2 = new Date(dailyCurrent.getTime() - 2 * dayMs);
  const old3 = new Date(dailyCurrent.getTime() - dayMs);
  const written: string[] = [];
  const runs = [
    { id: "d-1", generationAnchor: old1, status: "RUNNING" },
    { id: "d-2", generationAnchor: old2, status: "PENDING" },
    { id: "d-3", generationAnchor: old3, status: "RUNNING" },
    { id: "d-done", generationAnchor: new Date(dailyCurrent.getTime() - 4 * dayMs), status: "COMPLETED" },
    { id: "d-current", generationAnchor: dailyCurrent, status: "RUNNING" },
  ];
  const client: any = {
    vehicle: { count: async (): Promise<number> => 0 },
    vehicleHistoryIngestionCursor: { findMany: async (): Promise<readonly unknown[]> => [] },
    positionHistoryReplayRun: {
      findFirst: async (): Promise<any> => ({ id: "d-current", generationAnchor: dailyCurrent, rangeFrom: new Date(dailyCurrent.getTime() - dayMs), rangeTo: dailyCurrent, status: "RUNNING" }),
      findMany: async (): Promise<any> => runs.filter((run) => run.status !== "COMPLETED").sort((a, b) => a.generationAnchor.getTime() - b.generationAnchor.getTime()).map((run) => ({ ...run, rangeFrom: new Date(run.generationAnchor.getTime() - dayMs), rangeTo: run.generationAnchor })),
      upsert: async (): Promise<never> => { written.push("run.upsert"); throw new Error("must not write"); },
      create: async (): Promise<never> => { written.push("run.create"); throw new Error("must not write"); },
    },
    positionHistoryReplayCheckpoint: { count: async (): Promise<number> => 0, findMany: async (): Promise<readonly unknown[]> => [], createMany: async (): Promise<never> => { written.push("checkpoint.create"); throw new Error("must not write"); } },
    positionHistoryPopulationRun: { findFirst: async (): Promise<null> => null },
  };
  const response = await new PositionHistoryIngestionStatusService(config(true, true), { getClient: (): unknown => client } as any, telemetry()).inspect(now);
  assert.equal(response.replay.daily.incompleteGenerations, 4);
  assert.equal(response.replay.daily.overdueIncompleteGenerations, 3);
  assert.equal(response.replay.daily.oldestIncompleteGenerationAnchor, old1.toISOString());
  assert.equal(response.replay.daily.oldestOverdueGenerationAnchor, old1.toISOString());
  assert.equal(response.replay.daily.hasReplayDebt, true);
  assert.equal(written.length, 0);
});

test("retention floor alignment derives durable evidence from cursor metadata only", async () => {
  const { positionHistoryPolicyFloor } = await import("../position-history-horizon/position-history-policy-floor");
  const { summarizeRetentionFloorAlignment } = await import("./position-history-ingestion-status.service");
  const now = new Date("2026-09-14T12:00:00Z");
  const floor = positionHistoryPolicyFloor(now);
  const empty = summarizeRetentionFloorAlignment([], 0, floor);
  assert.deepEqual([empty.behind, empty.atOrBeyond, empty.aligned], [0, 0, false]);
  const missing = summarizeRetentionFloorAlignment([{ coverageFrom: floor }], 2, floor);
  assert.deepEqual([missing.behind, missing.atOrBeyond, missing.aligned], [0, 1, false]);
  const behind = summarizeRetentionFloorAlignment([{ coverageFrom: new Date(floor.getTime() - 1000) }, { coverageFrom: floor }], 2, floor);
  assert.deepEqual([behind.behind, behind.atOrBeyond, behind.aligned], [1, 1, false]);
  const aligned = summarizeRetentionFloorAlignment([{ coverageFrom: floor }, { coverageFrom: new Date(floor.getTime() + 1000) }], 2, floor);
  assert.deepEqual([aligned.behind, aligned.atOrBeyond, aligned.aligned], [0, 2, true]);
});
test("retention operational status distinguishes disabled, unobserved, success, skip, and failure", async () => {
  const now = new Date("2026-09-14T12:00:00Z");
  const { positionHistoryPolicyFloor } = await import("../position-history-horizon/position-history-policy-floor");
  const floor = positionHistoryPolicyFloor(now);
  void 0;
  const cursorsFor = (coverages: readonly Date[]) => ({
    vehicle: { count: async (): Promise<number> => coverages.length },
    vehicleHistoryIngestionCursor: { findMany: async (): Promise<any> => coverages.map((coverageFrom) => ({ confirmedThrough: new Date(now.getTime() - 1000), coverageFrom })) },
    positionHistoryReplayRun: { findFirst: async (): Promise<null> => null, findMany: async (): Promise<readonly unknown[]> => [] },
    positionHistoryReplayCheckpoint: { count: async (): Promise<number> => 0 },
    positionHistoryPopulationRun: { findFirst: async (): Promise<null> => null },
  });
  const disabled = await new PositionHistoryIngestionStatusService(config(false, false), { getClient: (): unknown => cursorsFor([floor]) } as any, telemetry()).inspect(now);
  assert.equal(disabled.retention.enabled, false);
  assert.equal(disabled.retention.lastOutcome, "NOT_OBSERVED_THIS_PROCESS");
  assert.equal(disabled.retention.nextScheduledExecutionAt, null);
  assert.equal(disabled.retention.currentRetentionPolicyFloor, floor.toISOString());
  assert.equal(disabled.retention.retentionFloorAligned, true);
  const unobserved = await new PositionHistoryIngestionStatusService(config(false, true), { getClient: (): unknown => cursorsFor([floor]) } as any, telemetry()).inspect(now);
  assert.equal(unobserved.retention.enabled, true);
  assert.equal(unobserved.retention.lastOutcome, "NOT_OBSERVED_THIS_PROCESS");
  assert.equal(unobserved.retention.lastAttemptAt, null);
  assert.equal(unobserved.retention.nextScheduledExecutionAt, "2026-09-15T06:00:00.000Z");
  const successTele = telemetry();
  successTele.startRetentionAttempt(new Date(now.getTime() - 1000));
  successTele.completeRetentionAttempt("SUCCESS", null, now);
  const success = await new PositionHistoryIngestionStatusService(config(true, true), { getClient: (): unknown => cursorsFor([floor]) } as any, successTele).inspect(now);
  assert.equal(success.retention.lastOutcome, "SUCCESS");
  assert.equal(success.retention.lastAttemptAt, new Date(now.getTime() - 1000).toISOString());
  assert.equal(success.retention.lastCompletedAt, now.toISOString());
  assert.equal(success.retention.lastSkipCategory, null);
  const skipTele = telemetry();
  skipTele.startRetentionAttempt(now);
  skipTele.completeRetentionAttempt("SKIPPED", "LOCK_UNAVAILABLE", now);
  const skipped = await new PositionHistoryIngestionStatusService(config(true, true), { getClient: (): unknown => cursorsFor([floor]) } as any, skipTele).inspect(now);
  assert.equal(skipped.retention.lastOutcome, "SKIPPED");
  assert.equal(skipped.retention.lastSkipCategory, "LOCK_UNAVAILABLE");
  const failTele = telemetry();
  failTele.startRetentionAttempt(now);
  failTele.completeRetentionAttempt("FAILED", null, now);
  const failed = await new PositionHistoryIngestionStatusService(config(true, true), { getClient: (): unknown => cursorsFor([floor]) } as any, failTele).inspect(now);
  assert.equal(failed.retention.lastOutcome, "FAILED");
  assert.equal(JSON.stringify(failed).includes("stack"), false);
  const behind = await new PositionHistoryIngestionStatusService(config(true, true), { getClient: (): unknown => cursorsFor([new Date(floor.getTime() - 1000), floor]) } as any, telemetry()).inspect(now);
  assert.deepEqual([behind.retention.cursorsBehindRetentionFloor, behind.retention.cursorsAtOrBeyondRetentionFloor, behind.retention.retentionFloorAligned], [1, 1, false]);
  const fresh = await new PositionHistoryIngestionStatusService(config(true, true), { getClient: (): unknown => cursorsFor([floor]) } as any, telemetry()).inspect(now);
  assert.equal(fresh.retention.lastOutcome, "NOT_OBSERVED_THIS_PROCESS");
});
