import assert from "node:assert/strict";
import test from "node:test";
import { EquGpsGatewayService } from "../equgps/equgps-gateway.service";
import type { DailyStatsRepository } from "./daily-stats.repository";
import { DailyRunsSyncService } from "./daily-runs-sync.service";
import type { DailyRunsSnapshot } from "./dashboard.types";

test("reads timezone before one getRuns call and uses one captured Kyiv clock value", async () => {
  const calls: string[] = []; let snapshot: DailyRunsSnapshot | undefined; let clockCalls = 0;
  const repository: DailyStatsRepository = { getTimezone: async () => { calls.push("timezone"); return "Europe/Kyiv"; }, persistRunsSnapshot: async (value) => { calls.push("repository"); snapshot = value; return { dailyStatsUpserted: 1, vehiclesWithoutRun: 0, unmatchedRuns: 0, protectedExactStats: 0 }; } };
  const gateway = { getRuns: async () => { calls.push("runs"); return [{ deviceId: 1, distanceMeters: 10 }]; } } as unknown as EquGpsGatewayService;
  const service = new DailyRunsSyncService(gateway, repository, { now: () => { clockCalls += 1; return new Date("2026-01-01T22:30:00.000Z"); } });
  assert.deepEqual(calls, []);
  const result = await service.syncCurrentDayRuns();
  assert.deepEqual(calls, ["timezone", "runs", "repository"]);
  assert.equal(clockCalls, 1);
  assert.equal(snapshot?.serviceDate, "2026-01-02");
  assert.equal(result.serviceDate, "2026-01-02");
  assert.equal("token" in result, false);
});

test("propagates gateway and repository errors without automatic work", async () => {
  const repository: DailyStatsRepository = { getTimezone: async () => "Europe/Kyiv", persistRunsSnapshot: async () => { throw new Error("repository"); } };
  const gateway = { getRuns: async () => { throw new Error("gateway"); } } as unknown as EquGpsGatewayService;
  const service = new DailyRunsSyncService(gateway, repository, { now: () => new Date() });
  await assert.rejects(service.syncCurrentDayRuns());
  const repositoryFailure = new DailyRunsSyncService({ getRuns: async () => [] } as unknown as EquGpsGatewayService, repository, { now: () => new Date() });
  await assert.rejects(repositoryFailure.syncCurrentDayRuns());
});

test("rejects an invalid configured timezone without exposing its value", async () => {
  const service = new DailyRunsSyncService({ getRuns: async () => [] } as unknown as EquGpsGatewayService, { getTimezone: async () => "not a timezone", persistRunsSnapshot: async () => ({ dailyStatsUpserted: 0, vehiclesWithoutRun: 0, unmatchedRuns: 0, protectedExactStats: 0 }) }, { now: () => new Date() });
  await assert.rejects(service.syncCurrentDayRuns(), (error: unknown) => error instanceof Error && !error.message.includes("not a timezone"));
});
