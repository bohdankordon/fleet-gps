import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryReplayKind } from "../../generated/prisma/client";
import type { ApiConfig } from "../../config/api-config";
import { PositionHistoryIngestionTelemetryService } from "../position-history-horizon-execution/position-history-ingestion-telemetry.service";
import { replayProgress, PositionHistoryIngestionStatusService, summarizeCursorLag } from "./position-history-ingestion-status.service";

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
    positionHistoryReplayRun: { findFirst: async (): Promise<null> => { calls.push("replay.findFirst"); return null; } },
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

test("replay empty, active, and completed states are truthful without creating work", async () => {
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
    positionHistoryReplayRun: { findFirst: async (args: any): Promise<any> => (args.where.kind === PositionHistoryReplayKind.DAILY_7_DAY ? { id: "run-daily", generationAnchor: anchor, rangeFrom: new Date("2026-09-07T02:00:00Z"), rangeTo: anchor, status: "RUNNING" } : null) },
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
    positionHistoryReplayRun: { findFirst: async (): Promise<any> => ({ id: "run-daily", generationAnchor: anchor, rangeFrom: new Date("2026-09-07T02:00:00Z"), rangeTo: anchor, status: "COMPLETED" }) },
    positionHistoryReplayCheckpoint: { count: async (args: any): Promise<number> => (args.where?.status === undefined ? 2 : 0) },
  });
  const completed = await new PositionHistoryIngestionStatusService(config(true, true), completedDb.service, telemetry()).inspect(new Date("2026-09-14T12:00:00Z"));
  assert.equal(completed.replay.daily.state, "COMPLETED");
  assert.equal(completed.replay.daily.checkpointsRemaining, 0);
  assert.equal(completed.replay.daily.progressPercent, 100);
  assert.equal(completed.replay.daily.debtSuspected, false);
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
    positionHistoryReplayRun: { findFirst: async (): Promise<any> => ({ id: "run-stale", generationAnchor: staleAnchor, rangeFrom: new Date("2026-09-06T02:00:00Z"), rangeTo: staleAnchor, status: "RUNNING" }) },
    positionHistoryReplayCheckpoint: { count: async (args: any): Promise<number> => (args.where?.status === undefined ? 3 : 2) },
  });
  const stale = await new PositionHistoryIngestionStatusService(config(true, true), staleDb.service, telemetry()).inspect(new Date("2026-09-14T12:00:00Z"));
  assert.equal(stale.replay.daily.debtSuspected, true);
  assert.equal(stale.replay.daily.isCurrent, false);
  const currentDb = database({
    positionHistoryReplayRun: { findFirst: async (): Promise<any> => ({ id: "run-current", generationAnchor: currentAnchor, rangeFrom: new Date("2026-09-07T02:00:00Z"), rangeTo: currentAnchor, status: "RUNNING" }) },
    positionHistoryReplayCheckpoint: { count: async (args: any): Promise<number> => (args.where?.status === undefined ? 3 : 2) },
  });
  const current = await new PositionHistoryIngestionStatusService(config(true, true), currentDb.service, telemetry()).inspect(new Date("2026-09-14T12:00:00Z"));
  assert.equal(current.replay.daily.isCurrent, true);
  assert.equal(current.replay.daily.debtSuspected, false);
});
