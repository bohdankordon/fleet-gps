import assert from "node:assert/strict";
import test from "node:test";
import type { FleetMapQueryRepository, FleetMapStoredVehicle } from "./fleet-map-query.repository";
import { FleetMapQueryService } from "./fleet-map-query.service";
import { UNRESTRICTED_VEHICLE_SCOPE } from "../vehicle-access/vehicle-access.service";

const now = new Date("2026-08-09T12:00:00.000Z");
const testUserId = "00000000-0000-4000-8000-000000000001";
const unrestrictedScopes = { resolve: async () => UNRESTRICTED_VEHICLE_SCOPE } as unknown as import("../vehicle-access/vehicle-access.service").VehicleScopeService;

function row(overrides: Partial<FleetMapStoredVehicle> = {}): FleetMapStoredVehicle {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Taxi 1",
    currentState: {
      fixTime: new Date("2026-08-09T11:59:00.000Z"),
      latitude: 49.2331,
      longitude: 28.4682,
      speedKph: 32.5,
      valid: true,
      outdated: false,
    },
    ...overrides,
  };
}

function service(vehicles: readonly FleetMapStoredVehicle[], threshold = 300): FleetMapQueryService {
  const repository: FleetMapQueryRepository = { getSnapshot: async () => ({ positionFreshnessSeconds: threshold, vehicles }) };
  return new FleetMapQueryService(repository, { now: () => now }, unrestrictedScopes);
}

test("returns a deterministic empty fleet snapshot", async () => {
  assert.deepEqual(await service([]).getSnapshot(testUserId), {
    generatedAt: now.toISOString(),
    positionFreshnessSeconds: 300,
    summary: { totalVehicles: 0, withPosition: 0, withoutPosition: 0, invalidPosition: 0, fresh: 0, stale: 0 },
    vehicles: [],
  });
});

test("maps one valid current position, persisted speed in km/h, and fixTime as observedAt", async () => {
  const result = await service([row()]).getSnapshot(testUserId);
  assert.deepEqual(result.vehicles[0], {
    vehicle: { id: "00000000-0000-4000-8000-000000000001", name: "Taxi 1" },
    position: { latitude: 49.2331, longitude: 28.4682, observedAt: "2026-08-09T11:59:00.000Z" },
    speedKph: 32.5,
    freshness: "FRESH",
  });
  assert.deepEqual(result.summary, { totalVehicles: 1, withPosition: 1, withoutPosition: 0, invalidPosition: 0, fresh: 1, stale: 0 });
});

test("captures generatedAt exactly once after the repository snapshot and avoids a concurrent-boundary false stale result", async () => {
  const preReadTime = new Date("2026-08-09T11:59:59.000Z");
  const fixTime = new Date("2026-08-09T12:00:00.000Z");
  const postReadTime = new Date("2026-08-09T12:00:01.000Z");
  const calls: string[] = [];
  let clockCalls = 0;
  const repository: FleetMapQueryRepository = {
    getSnapshot: async () => {
      calls.push("repository");
      return { positionFreshnessSeconds: 300, vehicles: [row({ currentState: { ...row().currentState!, fixTime } })] };
    },
  };
  const query = new FleetMapQueryService(repository, { now: () => { calls.push("clock"); clockCalls += 1; return postReadTime; } }, unrestrictedScopes);
  const result = await query.getSnapshot(testUserId);
  assert.ok(fixTime.getTime() > preReadTime.getTime());
  assert.deepEqual(calls, ["repository", "clock"]);
  assert.equal(clockCalls, 1);
  assert.equal(result.generatedAt, postReadTime.toISOString());
  assert.equal(result.vehicles[0]?.freshness, "FRESH");
});

test("preserves repository ordering for multiple vehicles and derives aggregate counts", async () => {
  const result = await service([
    row({ id: "a", name: "Alpha" }),
    row({ id: "b", name: "Beta", currentState: null }),
    row({ id: "c", name: "Gamma", currentState: { ...row().currentState!, latitude: 91 } }),
    row({ id: "d", name: "Omega", currentState: { ...row().currentState!, fixTime: new Date("2026-08-09T11:54:59.999Z") } }),
  ]).getSnapshot(testUserId);
  assert.deepEqual(result.vehicles.map((item) => item.vehicle.id), ["a", "d"]);
  assert.deepEqual(result.summary, { totalVehicles: 4, withPosition: 2, withoutPosition: 1, invalidPosition: 1, fresh: 1, stale: 1 });
});

test("accepts inclusive latitude and longitude boundaries", async () => {
  const coordinates = [[-90, -180], [-90, 180], [90, -180], [90, 180]] as const;
  const vehicles = coordinates.map(([latitude, longitude], index) => row({ id: String(index), currentState: { ...row().currentState!, latitude, longitude } }));
  const result = await service(vehicles).getSnapshot(testUserId);
  assert.equal(result.summary.withPosition, 4);
  assert.deepEqual(result.vehicles.map((item) => [item.position.latitude, item.position.longitude]), coordinates);
});

test("excludes non-finite and out-of-range latitude as invalidPosition", async () => {
  const values = [-91, 91, Number.NaN, Number.NEGATIVE_INFINITY];
  const result = await service(values.map((latitude, index) => row({ id: String(index), currentState: { ...row().currentState!, latitude } }))).getSnapshot(testUserId);
  assert.equal(result.vehicles.length, 0);
  assert.deepEqual(result.summary, { totalVehicles: 4, withPosition: 0, withoutPosition: 0, invalidPosition: 4, fresh: 0, stale: 0 });
});

test("excludes non-finite and out-of-range longitude as invalidPosition", async () => {
  const values = [-181, 181, Number.NaN, Number.POSITIVE_INFINITY];
  const result = await service(values.map((longitude, index) => row({ id: String(index), currentState: { ...row().currentState!, longitude } }))).getSnapshot(testUserId);
  assert.equal(result.vehicles.length, 0);
  assert.equal(result.summary.invalidPosition, 4);
});

test("separates a missing CurrentState or empty state from a structurally invalid persisted position", async () => {
  const emptyState = { fixTime: null, latitude: null, longitude: null, speedKph: null, valid: null, outdated: null } as const;
  const result = await service([
    row({ id: "missing", currentState: null }),
    row({ id: "empty", currentState: emptyState }),
    row({ id: "partial", currentState: { ...emptyState, latitude: 49 } }),
    row({ id: "bad-time", currentState: { ...row().currentState!, fixTime: new Date(Number.NaN) } }),
  ]).getSnapshot(testUserId);
  assert.equal(result.summary.withoutPosition, 2);
  assert.equal(result.summary.invalidPosition, 2);
});

test("uses the strict provider-state predicate and inclusive age boundary for freshness", async () => {
  const result = await service([
    row({ id: "boundary", currentState: { ...row().currentState!, fixTime: new Date("2026-08-09T11:55:00.000Z") } }),
    row({ id: "old", currentState: { ...row().currentState!, fixTime: new Date("2026-08-09T11:54:59.999Z") } }),
    row({ id: "outdated", currentState: { ...row().currentState!, outdated: true } }),
    row({ id: "outdated-unknown", currentState: { ...row().currentState!, outdated: null } }),
    row({ id: "future", currentState: { ...row().currentState!, fixTime: new Date("2026-08-09T12:00:00.001Z") } }),
    row({ id: "provider-invalid", currentState: { ...row().currentState!, valid: false } }),
    row({ id: "provider-unknown", currentState: { ...row().currentState!, valid: null } }),
  ]).getSnapshot(testUserId);
  assert.deepEqual(result.vehicles.map((item) => item.freshness), ["FRESH", "STALE", "STALE", "STALE", "STALE", "STALE", "STALE"]);
  assert.equal(result.summary.fresh, 1);
  assert.equal(result.summary.stale, 6);
});

test("returns null instead of invalid persisted speed and never derives speed", async () => {
  const result = await service([
    row({ id: "zero", currentState: { ...row().currentState!, speedKph: 0 } }),
    row({ id: "negative", currentState: { ...row().currentState!, speedKph: -1 } }),
    row({ id: "nan", currentState: { ...row().currentState!, speedKph: Number.NaN } }),
    row({ id: "provider-invalid", currentState: { ...row().currentState!, speedKph: 50, valid: false } }),
  ]).getSnapshot(testUserId);
  assert.deepEqual(result.vehicles.map((item) => item.speedKph), [0, null, null, null]);
});

test("public serialization is allow-listed and excludes provider and database internals", async () => {
  const result = await service([row()]).getSnapshot(testUserId);
  const marker = result.vehicles[0] as unknown as Record<string, unknown>;
  assert.deepEqual(Object.keys(marker), ["vehicle", "position", "speedKph", "freshness"]);
  assert.deepEqual(Object.keys(marker.vehicle as object), ["id", "name"]);
  assert.deepEqual(Object.keys(marker.position as object), ["latitude", "longitude", "observedAt"]);
  const json = JSON.stringify(result);
  for (const forbidden of ["externalDeviceId", "provider", "telegram", "dedupe", "outbox", "journal", "fetchedAt", "externalLastUpdateAt", "createdAt", "updatedAt"]) assert.equal(json.includes(forbidden), false);
});

test("fails safely for an invalid freshness setting or clock", async () => {
  await assert.rejects(service([], 0).getSnapshot(testUserId));
  const repository: FleetMapQueryRepository = { getSnapshot: async () => ({ positionFreshnessSeconds: 300, vehicles: [] }) };
  await assert.rejects(new FleetMapQueryService(repository, { now: () => new Date(Number.NaN) }, unrestrictedScopes).getSnapshot(testUserId));
});
