import assert from "node:assert/strict";
import test from "node:test";
import type { VehicleTrackQueryRepository, StoredVehicleTrackPoint } from "./vehicle-track-query.repository";
import { MAX_TRACK_POINTS } from "./vehicle-track-query.repository";
import { VehicleTrackQueryService } from "./vehicle-track-query.service";
import { UNRESTRICTED_VEHICLE_SCOPE } from "../vehicle-access/vehicle-access.service"; import { VehicleTrackNotFoundError, VehicleTrackStateError, VehicleTrackTooDenseError } from "./vehicle-track.types";

const testUserId = "00000000-0000-4000-8000-000000000099"; const unrestrictedScopes = { resolve: async () => UNRESTRICTED_VEHICLE_SCOPE } as unknown as import("../vehicle-access/vehicle-access.service").VehicleScopeService; const vehicleId = "00000000-0000-4000-8000-000000000001";
const from = new Date("2026-08-10T10:00:00.000Z");
const to = new Date("2026-08-10T11:00:00.000Z");
const now = new Date("2026-08-10T12:00:00.000Z");

function point(observedAt = from, overrides: Partial<StoredVehicleTrackPoint> = {}): StoredVehicleTrackPoint {
  return { observedAt, latitude: 49.2, longitude: 28.4, speedKph: null, valid: null, outdated: null, ...overrides };
}

function service(points: readonly StoredVehicleTrackPoint[], vehicle: { id: string; name: string; group: { id: string; name: string } | null } | null = { id: vehicleId, name: "Taxi", group: null }) {
  const repository: VehicleTrackQueryRepository = { getSnapshot: async () => ({ vehicle, points }) };
  return new VehicleTrackQueryService(repository, { now: () => now }, unrestrictedScopes);
}

test("maps empty, single, and multiple point summaries with exact safe fields", async () => {
  const empty = await service([]).getTrack(vehicleId, from, to, testUserId);
  assert.deepEqual(empty.summary, { pointCount: 0, firstObservedAt: null, lastObservedAt: null });
  const one = await service([point(from, { speedKph: 0, valid: false, outdated: true })]).getTrack(vehicleId, from, to, testUserId);
  assert.deepEqual(one, {
    generatedAt: now.toISOString(), vehicle: { id: vehicleId, name: "Taxi", group: null }, range: { from: from.toISOString(), to: to.toISOString() },
    summary: { pointCount: 1, firstObservedAt: from.toISOString(), lastObservedAt: from.toISOString() },
    points: [{ latitude: 49.2, longitude: 28.4, observedAt: from.toISOString(), speedKph: 0, valid: false, outdated: true }],
  });
  const later = new Date("2026-08-10T10:00:00.001Z");
  const multiple = await service([point(from), point(from, { latitude: 49.3, valid: true, outdated: false }), point(later)]).getTrack(vehicleId, from, to, testUserId);
  assert.equal(multiple.summary.pointCount, 3);
  assert.deepEqual(multiple.points.map((value) => value.latitude), [49.2, 49.3, 49.2]);
  assert.equal(multiple.summary.lastObservedAt, later.toISOString());
  assert.deepEqual(Object.keys(multiple.points[0]!).sort(), ["latitude", "longitude", "observedAt", "outdated", "speedKph", "valid"].sort());
});

test("captures generatedAt once after the complete repository snapshot", async () => {
  const calls: string[] = [];
  const repository: VehicleTrackQueryRepository = { getSnapshot: async () => { calls.push("repository"); return { vehicle: { id: vehicleId, name: "Taxi", group: null }, points: [] }; } };
  let clockCalls = 0;
  const query = new VehicleTrackQueryService(repository, { now: () => { calls.push("clock"); clockCalls += 1; return now; } }, unrestrictedScopes);
  await query.getTrack(vehicleId, from, to, testUserId);
  assert.deepEqual(calls, ["repository", "clock"]);
  assert.equal(clockCalls, 1);
});

test("allows 10,000 points and rejects the 10,001st without truncation", async () => {
  const tenThousand = Array.from({ length: MAX_TRACK_POINTS }, () => point());
  assert.equal((await service(tenThousand).getTrack(vehicleId, from, to, testUserId)).summary.pointCount, MAX_TRACK_POINTS);
  await assert.rejects(service([...tenThousand, point()]).getTrack(vehicleId, from, to, testUserId), VehicleTrackTooDenseError);
});

test("distinguishes unknown vehicle and fails safely on corrupt or unordered stored data", async () => {
  await assert.rejects(service([], null).getTrack(vehicleId, from, to, testUserId), VehicleTrackNotFoundError);
  await assert.rejects(service([point(from, { latitude: Number.NaN })]).getTrack(vehicleId, from, to, testUserId), VehicleTrackStateError);
  await assert.rejects(service([point(to), point(from)]).getTrack(vehicleId, from, to, testUserId), VehicleTrackStateError);
  await assert.rejects(new VehicleTrackQueryService({ getSnapshot: async () => ({ vehicle: { id: vehicleId, name: "Taxi", group: null }, points: [] }) }, { now: () => new Date(Number.NaN) }, unrestrictedScopes).getTrack(vehicleId, from, to, testUserId), VehicleTrackStateError);
});

test("preserves coordinate boundaries, nullable quality, and non-negative finite speed", async () => {
  const response = await service([point(from, { latitude: -90, longitude: -180 }), point(to, { latitude: 90, longitude: 180, speedKph: 12.5, valid: true, outdated: false })]).getTrack(vehicleId, from, to, testUserId);
  assert.equal(response.points.length, 2);
  for (const invalid of [point(from, { longitude: 181 }), point(from, { speedKph: -1 }), point(from, { speedKph: Number.POSITIVE_INFINITY })]) await assert.rejects(service([invalid]).getTrack(vehicleId, from, to, testUserId), VehicleTrackStateError);
});
