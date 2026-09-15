import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { TripStopAnalyticsVehicleNotFoundError } from "./trip-stop-analytics.errors";
import type { TripStopAnalyticsService } from "./trip-stop-analytics.service";
import type { TripStopAnalysisResult } from "./trip-stop-analytics.types";
import { TripStopAnalysisController } from "./trip-stop-analysis.controller";

const testAuth = { auth: { id: "00000000-0000-4000-8000-000000000099" } } as unknown as import("../auth/auth.types").AuthenticatedRequest; const testUserId = "00000000-0000-4000-8000-000000000099"; const id = "00000000-0000-4000-8000-000000000001";
const from = new Date("2026-08-01T00:00:00Z"); const to = new Date("2026-08-08T00:00:00Z");
const at = (seconds: number) => new Date(from.getTime() + seconds * 1_000);
function result(): TripStopAnalysisResult { return {
  vehicle: { id, name: "Taxi" }, range: { from, to, inclusive: true },
  summary: { rawObservationCount: 4, continuitySegmentCount: 2, tripCount: 1, stopCount: 1, gapCount: 1, totalObservedTripDistanceMeters: 123.5, firstObservationAt: from, lastObservationAt: at(700) },
  trips: [{ startAt: from, endAt: at(60), durationSeconds: 60, observedDistanceMeters: 123.5, startPosition: { observedAt: from, latitude: 49, longitude: 28 }, endPosition: { observedAt: at(60), latitude: 49.1, longitude: 28.1 }, terminationReason: "RANGE_END", startsAtRangeBoundary: true, endsAtRangeBoundary: true, observationCount: 2 }],
  stops: [{ startAt: at(300), endAt: at(600), durationSeconds: 300, startPosition: { observedAt: at(300), latitude: 49.2, longitude: 28.2 }, endPosition: { observedAt: at(600), latitude: 49.2, longitude: 28.2 }, terminationReason: "MOVEMENT", startsAtRangeBoundary: false, endsAtRangeBoundary: false, observationCount: 2 }],
  gaps: [{ fromObservedAt: at(600), toObservedAt: at(901), durationSeconds: 301 }],
}; }
function status(expected: number) { return (error: unknown) => error instanceof HttpException && error.getStatus() === expected; }

test("public GET maps Stage 15A results to stable truthful product DTO", async () => {
  let received: unknown;
  const controller = new TripStopAnalysisController({ analyze: async (...args: unknown[]) => { received = args; return result(); } } as unknown as TripStopAnalyticsService);
  const response = await controller.getAnalysis(id.toUpperCase(), "2026-08-01T02:00:00+02:00", "2026-08-08T00:00:00Z", testAuth);
  assert.deepEqual(received, [id, { from, to }, testUserId]);
  assert.equal(response.summary.totalObservedDistanceMeters, 123.5);
  assert.equal(response.trips[0]?.endClipped, true);
  assert.equal(response.trips[0]?.endAt, "2026-08-01T00:01:00.000Z");
  assert.equal(response.trips[0]?.endPosition.observedAt, response.trips[0]?.endAt);
  assert.equal(response.stops[0]?.endClipped, false);
  assert.equal(response.gaps[0]?.durationSeconds, 301);
  assert.equal("startClipped" in (response.trips[0] ?? {}), false);
  assert.equal("endsAtRangeBoundary" in (response.trips[0] ?? {}), false);
  assert.equal("startsAtRangeBoundary" in (response.trips[0] ?? {}), false);
  assert.equal("totalObservedTripDistanceMeters" in response.summary, false);
});

test("known vehicle with zero observations returns HTTP-success empty DTO", async () => {
  const empty = result();
  const controller = new TripStopAnalysisController({ analyze: async () => ({ ...empty, summary: { ...empty.summary, rawObservationCount: 0, continuitySegmentCount: 0, tripCount: 0, stopCount: 0, gapCount: 0, totalObservedTripDistanceMeters: 0, firstObservationAt: null, lastObservationAt: null }, trips: [], stops: [], gaps: [] }) } as unknown as TripStopAnalyticsService);
  const response = await controller.getAnalysis(id, from.toISOString(), to.toISOString(), testAuth);
  assert.deepEqual(response.summary, { tripCount: 0, stopCount: 0, gapCount: 0, totalObservedDistanceMeters: 0, rawObservationCount: 0, firstObservationAt: null, lastObservationAt: null });
});

test("strictly validates UUID, absolute timestamps, order, and seven-day bound", async () => {
  let calls = 0; const controller = new TripStopAnalysisController({ analyze: async () => { calls += 1; return result(); } } as unknown as TripStopAnalyticsService);
  for (const args of [["bad", from.toISOString(), to.toISOString()], [id, "2026-08-01", to.toISOString()], [id, from.toISOString(), from.toISOString()], [id, from.toISOString(), "2026-08-08T00:00:00.001Z"]] as const) await assert.rejects(controller.getAnalysis(args[0], args[1], args[2], testAuth), status(400));
  assert.equal(calls, 0);
  await controller.getAnalysis(id, from.toISOString(), to.toISOString(), testAuth); assert.equal(calls, 1);
});

test("unknown vehicle maps to established 404 and internal errors remain safe", async () => {
  for (const [error, expected] of [[new TripStopAnalyticsVehicleNotFoundError(), 404], [new Error("database secret"), 500]] as const) {
    const controller = new TripStopAnalysisController({ analyze: async () => { throw error; } } as unknown as TripStopAnalyticsService);
    await assert.rejects(controller.getAnalysis(id, from.toISOString(), to.toISOString(), testAuth), status(expected));
  }
});

