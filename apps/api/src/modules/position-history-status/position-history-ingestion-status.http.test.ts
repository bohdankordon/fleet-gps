import assert from "node:assert/strict";
import test from "node:test";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { Reflector, APP_GUARD } from "@nestjs/core";
import { AuthRole } from "../../generated/prisma/enums";
import { AuthService } from "../auth/auth.service";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { PermissionGuard } from "../auth/permission.guard";
import { PositionHistoryStatusController } from "./position-history-status.controller";
import { PositionHistoryStatusService } from "./position-history-status.service";
import { PositionHistoryIngestionStatusService } from "./position-history-ingestion-status.service";

const operatorToken = "o".repeat(43);
const viewerToken = "v".repeat(43);
const operator = { id: "00000000-0000-4000-8000-000000000001", login: "operator", role: AuthRole.USER, permissions: ["historyAdmin.view"], mustChangePassword: false, sessionTokenHash: new Uint8Array(32) };
const viewer = { id: "00000000-0000-4000-8000-000000000002", login: "viewer", role: AuthRole.USER, permissions: ["fleet.view"], mustChangePassword: false, sessionTokenHash: new Uint8Array(32) };
const safeResponse = Object.freeze({
  generatedAt: "2026-09-14T12:00:00.000Z",
  configuration: Object.freeze({ continuousIngestionEnabled: false, automaticRetentionEnabled: false }),
  runtime: Object.freeze({ pollerStarted: false, cycleInFlight: false, lastCycleStartedAt: null, lastCycleCompletedAt: null, processStartedAt: "2026-09-14T12:00:00.000Z" }),
  providerTraffic: Object.freeze({ requestStartsLastMinute: 0, requestStartsSinceProcessStart: 0, retriesSinceProcessStart: 0, rateLimitResponsesSinceProcessStart: 0, provider5xxSinceProcessStart: 0, networkFailuresSinceProcessStart: 0, timeoutsSinceProcessStart: 0, contractFailuresSinceProcessStart: 0, storageFailuresSinceProcessStart: 0, providerBlockedResponsesSinceProcessStart: 0, unknownFailuresSinceProcessStart: 0 }),
  coordination: Object.freeze({ historyLockContentionSinceProcessStart: 0, providerBlockedStreams: 0, durablePopulationActive: false }),
  cursor: Object.freeze({ mappedVehicles: 0, cursorCount: 0, missingCursorCount: 0, medianLagSeconds: null, worstLagSeconds: null, oldestConfirmedThrough: null, currentSafeBoundary: "2026-09-14T11:58:00.000Z" }),
  recentTail: Object.freeze({ lastSuccessAt: null, successesSinceProcessStart: 0, failuresSinceProcessStart: 0 }),
  replay: Object.freeze({
    daily: Object.freeze({ state: "NOT_CREATED", generationAnchor: null, rangeFrom: null, rangeTo: null, checkpointsTotal: 0, checkpointsCompleted: 0, checkpointsRemaining: 0, progressPercent: null, isCurrent: false, debtSuspected: false, incompleteGenerations: 0, overdueIncompleteGenerations: 0, oldestIncompleteGenerationAnchor: null, oldestOverdueGenerationAnchor: null, hasReplayDebt: false }),
    rolling: Object.freeze({ state: "NOT_CREATED", generationAnchor: null, rangeFrom: null, rangeTo: null, checkpointsTotal: 0, checkpointsCompleted: 0, checkpointsRemaining: 0, progressPercent: null, isCurrent: false, debtSuspected: false, incompleteGenerations: 0, overdueIncompleteGenerations: 0, oldestIncompleteGenerationAnchor: null, oldestOverdueGenerationAnchor: null, hasReplayDebt: false }),
  }),
  meta: Object.freeze({ telemetryScope: "process-local", durableScope: "database", countersResetOnRestart: true }),
  retention: Object.freeze({ enabled: false, running: false, lastAttemptAt: null, lastCompletedAt: null, lastOutcome: "NOT_OBSERVED_THIS_PROCESS", lastSkipCategory: null, nextScheduledExecutionAt: null, currentRetentionPolicyFloor: "2026-06-15T02:00:00.000Z", cursorsBehindRetentionFloor: 0, cursorsAtOrBeyondRetentionFloor: 0, retentionFloorAligned: false }),
});

async function appWith(): Promise<INestApplication> {
  const module = await Test.createTestingModule({
    controllers: [PositionHistoryStatusController],
    providers: [
      Reflector,
      { provide: PositionHistoryStatusService, useValue: { inspect: async (): Promise<never> => { throw new Error("horizon status must not be called"); } } },
      { provide: PositionHistoryIngestionStatusService, useValue: { inspect: async (): Promise<unknown> => safeResponse } },
      { provide: AuthService, useValue: { authenticate: async (value: string): Promise<unknown> => (value === operatorToken ? operator : value === viewerToken ? viewer : null) } },
      AuthenticationGuard,
      PermissionGuard,
      { provide: APP_GUARD, useClass: AuthenticationGuard },
      { provide: APP_GUARD, useClass: PermissionGuard },
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix("api");
  await app.listen(0, "127.0.0.1");
  return app;
}

function url(app: INestApplication): string {
  return "http://127.0.0.1:" + (app.getHttpServer().address() as { port: number }).port + "/api/system/position-history/ingestion-status";
}

test("ingestion status rejects unauthenticated operators", { timeout: 15000 }, async () => {
  const app = await appWith();
  try {
    const res = await fetch(url(app));
    assert.notEqual(res.status, 200);
    const body = await res.text();
    assert.equal(body.includes("fixFingerprint"), false);
  } finally { await app.close(); }
});

test("ingestion status rejects authenticated operators without historyAdmin.view", { timeout: 15000 }, async () => {
  const app = await appWith();
  try {
    const res = await fetch(url(app), { headers: { cookie: "taxi_session=" + viewerToken } });
    assert.notEqual(res.status, 200);
  } finally { await app.close(); }
});

test("ingestion status accepts authorized operators with historyAdmin.view and is read-only", { timeout: 15000 }, async () => {
  const app = await appWith();
  try {
    const res = await fetch(url(app), { headers: { cookie: "taxi_session=" + operatorToken } });
    assert.equal(res.status, 200);
    assert.equal((res.headers.get("content-type") ?? "").includes("application/json"), true);
    const body = await res.json() as typeof safeResponse;
    assert.equal(body.configuration.continuousIngestionEnabled, false);
    assert.equal(body.cursor.mappedVehicles, 0);
    assert.equal(JSON.stringify(body).includes("leaseOwner"), false);
    assert.ok((res.headers.get("cache-control") ?? "").includes("no-store"));
    assert.equal(body.retention.lastOutcome, "NOT_OBSERVED_THIS_PROCESS");
    assert.equal(body.replay.daily.hasReplayDebt, false);
  } finally { await app.close(); }
});
