import assert from "node:assert/strict";
import test from "node:test";
import { EquGpsHttpError, EquGpsNetworkError, EquGpsRateLimitError, EquGpsResponseValidationError, EquGpsTimeoutError, type EquGpsPosition } from "@taxi-gps/equgps";
import { PositionIngestionSource } from "../../generated/prisma/client";
import type { EquGpsGatewayService } from "../equgps/equgps-gateway.service";
import { recordedPositionHistoryBackfillProviderFailure } from "../position-history-backfill/position-history-backfill-failure-diagnostics";
import { POSITION_HISTORY_HISTORICAL_WINDOW_MAX_ROWS } from "./position-history-historical-window.constants";
import { PositionHistoryBackfillProviderContractError, PositionHistoryBackfillTargetError } from "./position-history-historical-window.errors";
import { PositionHistoryHistoricalWindowService } from "./position-history-historical-window.service";

const from = new Date("2026-08-10T00:00:00.000Z");
const to = new Date("2026-08-10T01:00:00.000Z");
const request = { externalDeviceId: 7, from, to } as const;
const point = (at: string, overrides: Partial<EquGpsPosition> = {}): EquGpsPosition => ({ deviceId: 7, fixTime: at, latitude: 49.2, longitude: 28.4, speedKnots: 10, valid: true, outdated: false, ...overrides });

function harness(options: { responses?: Array<readonly EquGpsPosition[] | Error>; clockValues?: Date[] } = {}) {
  const calls: unknown[] = [];
  const sleeps: number[] = [];
  let responseIndex = 0;
  let clockIndex = 0;
  const gateway = { getHistoricalPositions: async (params: unknown) => {
    calls.push(params);
    const response = options.responses?.[responseIndex++] ?? [];
    if (response instanceof Error) throw response;
    return response;
  } } as unknown as EquGpsGatewayService;
  const service = new PositionHistoryHistoricalWindowService(
    gateway,
    { now: () => new Date((options.clockValues?.[clockIndex++] ?? new Date("2026-08-10T12:30:00.000Z")).getTime()) },
    { sleep: async (durationMs) => { sleeps.push(durationMs); } },
  );
  return { service, calls, sleeps };
}

test("maps every valid fix into an immutable normalized historical result", async () => {
  const item = harness({ responses: [[point("2026-08-10T00:10:00Z"), point("2026-08-10T00:20:00Z", { latitude: 49.3 })]] });
  const result = await item.service.read(request);
  assert.equal(result.providerRows, 2);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.skippedInvalid, 0);
  assert.equal(result.candidates.every(({ ingestionSource }) => ingestionSource === PositionIngestionSource.HISTORICAL_BACKFILL), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.candidates), true);
  assert.deepEqual(item.calls, [{ deviceId: 7, from: from.toISOString(), to: to.toISOString() }]);
});

test("captures fetchedAt from the successful attempt and returns copied fetch boundaries", async () => {
  const fetchedAt = new Date("2026-08-10T12:34:56.789Z");
  const result = await harness({ responses: [[point("2026-08-10T00:10:00Z")]], clockValues: [fetchedAt] }).service.read(request);
  assert.equal(result.fetchedAt.toISOString(), fetchedAt.toISOString());
  assert.equal(result.candidates[0]?.fetchedAt.toISOString(), fetchedAt.toISOString());
  assert.notEqual(result.fetchFrom, from);
  assert.notEqual(result.fetchTo, to);
  assert.equal(result.fetchFrom.toISOString(), from.toISOString());
  assert.equal(result.fetchTo.toISOString(), to.toISOString());
});

test("preserves legacy invalid-row skipping and quality-flag behavior", async () => {
  const result = await harness({ responses: [[
    point("invalid"),
    point("2026-08-10T00:10:00Z", { latitude: 91 }),
    point("2026-08-10T00:20:00Z", { speedKnots: -1, valid: false, outdated: true }),
  ]] }).service.read(request);
  assert.equal(result.providerRows, 3);
  assert.equal(result.skippedInvalid, 2);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.speedKph, null);
  assert.equal(result.candidates[0]?.valid, false);
  assert.equal(result.candidates[0]?.outdated, true);
});

test("accepts inclusive fetch boundaries", async () => {
  const result = await harness({ responses: [[point(from.toISOString()), point(to.toISOString())]] }).service.read(request);
  assert.deepEqual(result.candidates.map(({ observedAt }) => observedAt.toISOString()), [from.toISOString(), to.toISOString()]);
});

test("permits overlap candidates older than a hypothetical progress boundary", async () => {
  const hypotheticalExpectedProgress = new Date("2026-08-10T00:45:00Z");
  const result = await harness({ responses: [[point("2026-08-10T00:30:00Z")]] }).service.read(request);
  assert.ok(result.candidates[0]!.observedAt < hypotheticalExpectedProgress);
  for (const forbidden of ["checkpointId", "cursor", "coverageFrom", "confirmedThrough", "expectedConfirmedThrough", "nextConfirmedThrough", "completed", "durableRunId"]) assert.equal(forbidden in result, false);
});

test("rejects invalid device IDs, dates, empty ranges, and requests over one hour before provider access", async () => {
  const item = harness();
  for (const invalid of [
    { ...request, externalDeviceId: 0 },
    { ...request, externalDeviceId: 1.5 },
    { ...request, from: new Date(Number.NaN) },
    { ...request, to: from },
    { ...request, to: new Date(to.getTime() + 1) },
  ]) await assert.rejects(item.service.read(invalid), PositionHistoryBackfillTargetError);
  assert.equal(item.calls.length, 0);
});

test("wrong returned device fails the whole window", async () => {
  await assert.rejects(harness({ responses: [[point("2026-08-10T00:10:00Z"), point("2026-08-10T00:20:00Z", { deviceId: 8 })]] }).service.read(request), PositionHistoryBackfillProviderContractError);
});

test("usable timestamps before or after the inclusive fetch range fail the whole window", async () => {
  for (const at of ["2026-08-09T23:59:59.999Z", "2026-08-10T01:00:00.001Z"]) {
    await assert.rejects(harness({ responses: [[point(at)]] }).service.read(request), PositionHistoryBackfillProviderContractError);
  }
});

test("more than 10,000 provider rows fails safely without normalization output", async () => {
  const rows = Array.from({ length: POSITION_HISTORY_HISTORICAL_WINDOW_MAX_ROWS + 1 }, () => point("2026-08-10T00:10:00Z"));
  await assert.rejects(harness({ responses: [rows] }).service.read(request), PositionHistoryBackfillProviderContractError);
});

test("network and timeout failures retry with bounded exponential delay", async () => {
  for (const failure of [new EquGpsNetworkError("getHistoricalPositions"), new EquGpsTimeoutError("getHistoricalPositions")]) {
    const item = harness({ responses: [failure, []] });
    const result = await item.service.read(request);
    assert.deepEqual({ requests: result.requests, retries: result.retries, rateLimitResponses: result.rateLimitResponses }, { requests: 2, retries: 1, rateLimitResponses: 0 });
    assert.deepEqual(item.sleeps, [1_000]);
  }
});

test("429 honors Retry-After and retains exact accounting", async () => {
  const item = harness({ responses: [new EquGpsRateLimitError("getHistoricalPositions", 1_500), []] });
  const result = await item.service.read(request);
  assert.deepEqual({ requests: result.requests, retries: result.retries, rateLimitResponses: result.rateLimitResponses }, { requests: 2, retries: 1, rateLimitResponses: 1 });
  assert.deepEqual(item.sleeps, [1_500]);
});

test("HTTP 5xx retries while stable HTTP 4xx does not", async () => {
  const transient = harness({ responses: [new EquGpsHttpError(503, "getHistoricalPositions"), []] });
  assert.equal((await transient.service.read(request)).retries, 1);
  assert.deepEqual(transient.sleeps, [1_000]);

  const permanent = harness({ responses: [new EquGpsHttpError(400, "getHistoricalPositions")] });
  await assert.rejects(permanent.service.read(request), EquGpsHttpError);
  assert.equal(permanent.calls.length, 1);
  assert.deepEqual(permanent.sleeps, []);
});

test("provider schema/contract failure is not retried", async () => {
  const failure = new EquGpsResponseValidationError("getHistoricalPositions", "unexpected_response_shape");
  const item = harness({ responses: [failure] });
  await assert.rejects(item.service.read(request), (error) => error === failure);
  assert.equal(item.calls.length, 1);
  assert.deepEqual(item.sleeps, []);
  assert.deepEqual(recordedPositionHistoryBackfillProviderFailure(failure), { category: "contract", retryable: false, diagnosticCode: "unexpected_response_shape" });
});

test("three transient failures exhaust attempts and propagate the original final error", async () => {
  const failures = [new EquGpsTimeoutError("getHistoricalPositions"), new EquGpsTimeoutError("getHistoricalPositions"), new EquGpsTimeoutError("getHistoricalPositions")];
  const item = harness({ responses: failures });
  await assert.rejects(item.service.read(request), (error) => error === failures[2]);
  assert.equal(item.calls.length, 3);
  assert.deepEqual(item.sleeps, [1_000, 2_000]);
});

test("excessive Retry-After propagates without sleeping", async () => {
  const failure = new EquGpsRateLimitError("getHistoricalPositions", 60_001);
  const item = harness({ responses: [failure] });
  await assert.rejects(item.service.read(request), (error) => error === failure);
  assert.equal(item.calls.length, 1);
  assert.deepEqual(item.sleeps, []);
  assert.deepEqual(recordedPositionHistoryBackfillProviderFailure(failure), { category: "rate_limit", status: 429, retryable: false, retryAfterPolicy: "exceeds_limit" });
});

test("mixed retries expose cumulative request, retry, rate-limit, and successful-attempt time", async () => {
  const item = harness({
    responses: [new EquGpsRateLimitError("getHistoricalPositions", null), new EquGpsHttpError(500, "getHistoricalPositions"), [point("2026-08-10T00:10:00Z")]],
    clockValues: [new Date("2026-08-10T12:00:00Z"), new Date("2026-08-10T12:00:01Z"), new Date("2026-08-10T12:00:02Z")],
  });
  const result = await item.service.read(request);
  assert.deepEqual({ requests: result.requests, retries: result.retries, rateLimitResponses: result.rateLimitResponses, fetchedAt: result.fetchedAt.toISOString() }, { requests: 3, retries: 2, rateLimitResponses: 1, fetchedAt: "2026-08-10T12:00:02.000Z" });
  assert.deepEqual(item.sleeps, [1_000, 2_000]);
});
