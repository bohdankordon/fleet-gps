import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_OVERVIEW_POINTS,
  type StoredVehicleTrackOverviewPoint,
  type StoredVehicleTrackOverviewSnapshot,
  type VehicleTrackOverviewQueryRepository,
} from "./vehicle-track-overview-query.repository";
import { UNRESTRICTED_VEHICLE_SCOPE } from "../vehicle-access/vehicle-access.service"; import { VehicleTrackOverviewQueryService } from "./vehicle-track-overview-query.service";
import { VehicleTrackOverviewNotFoundError, VehicleTrackOverviewStateError, VehicleTrackOverviewTooFragmentedError } from "./vehicle-track-overview.types";

const testUserId = "00000000-0000-4000-8000-000000000099"; const unrestrictedScopes = { resolve: async () => UNRESTRICTED_VEHICLE_SCOPE } as unknown as import("../vehicle-access/vehicle-access.service").VehicleScopeService; const vehicleId = "00000000-0000-4000-8000-000000000001";
const from = new Date("2026-08-01T00:00:00.000Z");
const to = new Date("2026-08-08T00:00:00.000Z");
const now = new Date("2026-08-10T12:00:00.000Z");
const vehicle = Object.freeze({ id: vehicleId, name: "Taxi", group: null });

function point(observedAt: Date, overrides: Partial<StoredVehicleTrackOverviewPoint> = {}): StoredVehicleTrackOverviewPoint {
  return {
    segmentOrdinal: 1,
    segmentRawPointCount: 1,
    segmentFirstObservedAt: observedAt,
    segmentLastObservedAt: observedAt,
    observedAt,
    latitude: 49.2,
    longitude: 28.4,
    speedKph: null,
    valid: null,
    outdated: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<StoredVehicleTrackOverviewSnapshot> = {}): StoredVehicleTrackOverviewSnapshot {
  return {
    vehicle,
    rawPointCount: 0,
    segmentCount: 0,
    qualityWarningCount: 0,
    firstObservedAt: null,
    lastObservedAt: null,
    tooFragmented: false,
    points: [],
    ...overrides,
  };
}

function service(value: StoredVehicleTrackOverviewSnapshot): VehicleTrackOverviewQueryService {
  const repository: VehicleTrackOverviewQueryRepository = { getOverviewSnapshot: async () => value };
  return new VehicleTrackOverviewQueryService(repository, { now: () => now }, unrestrictedScopes);
}

test("maps known empty and one-point history with explicit sampled overview semantics", async () => {
  const empty = await service(snapshot()).getOverview(vehicleId, from, to, testUserId);
  assert.deepEqual(empty, {
    generatedAt: now.toISOString(), vehicle, range: { from: from.toISOString(), to: to.toISOString() },
    summary: { rawPointCount: 0, returnedPointCount: 0, segmentCount: 0, gapCount: 0, qualityWarningCount: 0, firstObservedAt: null, lastObservedAt: null, sampled: true },
    segments: [],
  });

  const at = new Date("2026-08-02T12:00:00.000Z");
  const onePoint = point(at, { speedKph: 0, valid: false, outdated: true });
  const one = await service(snapshot({ rawPointCount: 1, segmentCount: 1, qualityWarningCount: 1, firstObservedAt: at, lastObservedAt: at, points: [onePoint] })).getOverview(vehicleId, from, to, testUserId);
  assert.deepEqual(one.summary, { rawPointCount: 1, returnedPointCount: 1, segmentCount: 1, gapCount: 0, qualityWarningCount: 1, firstObservedAt: at.toISOString(), lastObservedAt: at.toISOString(), sampled: true });
  assert.deepEqual(one.segments, [{ rawPointCount: 1, firstObservedAt: at.toISOString(), lastObservedAt: at.toISOString(), points: [{ latitude: 49.2, longitude: 28.4, observedAt: at.toISOString(), speedKph: 0, valid: false, outdated: true }] }]);
});

test("preserves all ordered distinct fixes below the target and leaks no persistence internals", async () => {
  const at = new Date("2026-08-02T12:00:00.000Z");
  const later = new Date(at.getTime() + 1);
  const points = [
    point(at, { segmentRawPointCount: 3, segmentLastObservedAt: later, latitude: 49.1 }),
    point(at, { segmentRawPointCount: 3, segmentLastObservedAt: later, latitude: 49.2 }),
    point(later, { segmentRawPointCount: 3, segmentFirstObservedAt: at, latitude: 49.3 }),
  ];
  const result = await service(snapshot({ rawPointCount: 3, segmentCount: 1, firstObservedAt: at, lastObservedAt: later, points })).getOverview(vehicleId, from, to, testUserId);
  assert.deepEqual(result.segments[0]!.points.map((value) => value.latitude), [49.1, 49.2, 49.3]);
  assert.deepEqual(Object.keys(result.segments[0]!.points[0]!).sort(), ["latitude", "longitude", "observedAt", "outdated", "speedKph", "valid"].sort());
  assert.deepEqual(Object.keys(result).sort(), ["generatedAt", "range", "segments", "summary", "vehicle"].sort());
  assert.equal(JSON.stringify(result).includes("fixFingerprint"), false);
  assert.equal(JSON.stringify(result).includes("ingestionSource"), false);
});

test("keeps output bounded for a logical 50,000-row raw range and is deterministic", async () => {
  const first = new Date("2026-08-02T00:00:00.000Z");
  const last = new Date(first.getTime() + 50_000_000);
  const selected = Array.from({ length: MAX_OVERVIEW_POINTS }, (_, index) => {
    const observedAt = index === MAX_OVERVIEW_POINTS - 1 ? last : new Date(first.getTime() + index * 1_000);
    return point(observedAt, { segmentRawPointCount: 50_000, segmentFirstObservedAt: first, segmentLastObservedAt: last, latitude: 49 + index / 100_000 });
  });
  const value = snapshot({ rawPointCount: 50_000, segmentCount: 1, qualityWarningCount: 317, firstObservedAt: first, lastObservedAt: last, points: selected });
  const query = service(value);
  const firstResult = await query.getOverview(vehicleId, from, to, testUserId);
  const secondResult = await query.getOverview(vehicleId, from, to, testUserId);
  assert.deepEqual(secondResult, firstResult);
  assert.equal(firstResult.summary.rawPointCount, 50_000);
  assert.equal(firstResult.summary.returnedPointCount, MAX_OVERVIEW_POINTS);
  assert.equal(firstResult.segments[0]!.points.length, MAX_OVERVIEW_POINTS);
  assert.equal(firstResult.summary.firstObservedAt, first.toISOString());
  assert.equal(firstResult.summary.lastObservedAt, last.toISOString());
  assert.equal(firstResult.segments[0]!.points[0]!.observedAt, first.toISOString());
  assert.equal(firstResult.segments[0]!.points.at(-1)!.observedAt, last.toISOString());
});

test("captures generatedAt once after the complete repository snapshot", async () => {
  const calls: string[] = [];
  const repository: VehicleTrackOverviewQueryRepository = { getOverviewSnapshot: async () => { calls.push("repository"); return snapshot(); } };
  let clockCalls = 0;
  const query = new VehicleTrackOverviewQueryService(repository, { now: () => { calls.push("clock"); clockCalls += 1; return now; } }, unrestrictedScopes);
  await query.getOverview(vehicleId, from, to, testUserId);
  assert.deepEqual(calls, ["repository", "clock"]);
  assert.equal(clockCalls, 1);
});

test("uses raw segment membership so true gaps survive and sampling intervals do not create false gaps", async () => {
  const a = new Date("2026-08-02T00:00:00.000Z");
  const b = new Date("2026-08-02T00:10:00.000Z");
  const c = new Date("2026-08-02T00:16:41.000Z");
  const d = new Date("2026-08-02T00:20:00.000Z");
  const points = [
    point(a, { segmentOrdinal: 1, segmentRawPointCount: 10_000, segmentFirstObservedAt: a, segmentLastObservedAt: b }),
    point(b, { segmentOrdinal: 1, segmentRawPointCount: 10_000, segmentFirstObservedAt: a, segmentLastObservedAt: b }),
    point(c, { segmentOrdinal: 2, segmentRawPointCount: 8_000, segmentFirstObservedAt: c, segmentLastObservedAt: d }),
    point(d, { segmentOrdinal: 2, segmentRawPointCount: 8_000, segmentFirstObservedAt: c, segmentLastObservedAt: d }),
  ];
  const result = await service(snapshot({ rawPointCount: 18_000, segmentCount: 2, firstObservedAt: a, lastObservedAt: d, points })).getOverview(vehicleId, from, to, testUserId);
  assert.equal(result.summary.gapCount, 1);
  assert.equal(result.segments.length, 2);
  assert.deepEqual(result.segments.map((segment) => segment.points.length), [2, 2]);
  assert.equal((Date.parse(result.segments[0]!.points[1]!.observedAt) - Date.parse(result.segments[0]!.points[0]!.observedAt)) / 1_000, 600);
});

test("distinguishes unknown and too-fragmented ranges and fails safely on corrupt repository state", async () => {
  await assert.rejects(service(snapshot({ vehicle: null })).getOverview(vehicleId, from, to, testUserId), VehicleTrackOverviewNotFoundError);
  await assert.rejects(service(snapshot({ tooFragmented: true })).getOverview(vehicleId, from, to, testUserId), VehicleTrackOverviewTooFragmentedError);
  await assert.rejects(service(snapshot({ rawPointCount: 1 })).getOverview(vehicleId, from, to, testUserId), VehicleTrackOverviewStateError);
  const at = new Date("2026-08-02T00:00:00.000Z");
  await assert.rejects(service(snapshot({ rawPointCount: 1, segmentCount: 1, firstObservedAt: at, lastObservedAt: at, points: [point(at, { latitude: Number.NaN })] })).getOverview(vehicleId, from, to, testUserId), VehicleTrackOverviewStateError);
  await assert.rejects(service(snapshot({ rawPointCount: MAX_OVERVIEW_POINTS + 1, segmentCount: 1, firstObservedAt: at, lastObservedAt: at, points: Array.from({ length: MAX_OVERVIEW_POINTS + 1 }, () => point(at, { segmentRawPointCount: MAX_OVERVIEW_POINTS + 1 })) })).getOverview(vehicleId, from, to, testUserId), VehicleTrackOverviewStateError);
});
