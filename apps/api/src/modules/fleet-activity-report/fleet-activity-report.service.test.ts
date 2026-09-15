import assert from "node:assert/strict";
import test from "node:test";
import { FleetActivityReportService } from "./fleet-activity-report.service";
import type { FleetActivityReportRepository } from "./fleet-activity-report.types";
import { DEFAULT_TRIP_STOP_ANALYTICS_POLICY } from "../trip-stop-analytics";
import { UNRESTRICTED_VEHICLE_SCOPE } from "../vehicle-access/vehicle-access.service";

const from = new Date("2026-08-01T00:00:00Z"); const to = new Date("2026-08-02T00:00:00Z");
const testUserId = "00000000-0000-4000-8000-000000000001";
const unrestrictedScopes = { resolve: async () => UNRESTRICTED_VEHICLE_SCOPE } as unknown as import("../vehicle-access/vehicle-access.service").VehicleScopeService;
const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"];
const observation = (vehicleId: string, seconds: number, speedKph: number | null, latitude = 49) => ({ vehicleId, observedAt: new Date(from.getTime() + seconds * 1_000), fixFingerprint: `${vehicleId}-${seconds}`, latitude, longitude: 28, speedKph, valid: true, outdated: false });

test("groups one bounded snapshot and aggregates the authoritative Stage 15A core for every persisted vehicle", async () => {
  let reads = 0; const repository: FleetActivityReportRepository = { getSnapshot: async () => { reads += 1; return { vehicles: [{ id: ids[0]!, name: "Trip", group: null }, { id: ids[1]!, name: "GPS only", group: null }, { id: ids[2]!, name: "No GPS", group: null }], observations: [observation(ids[1]!, 0, null), observation(ids[0]!, 0, 10), observation(ids[0]!, 60, 10, 49.01), observation(ids[0]!, 120, 0, 49.01), observation(ids[0]!, 420, 0, 49.01)] }; } };
  const report = await new FleetActivityReportService(repository, { getReportContext: async () => ({ timezone: "Europe/Kyiv", policy: DEFAULT_TRIP_STOP_ANALYTICS_POLICY }) } as any, unrestrictedScopes).getReport({ from, to }, testUserId);
  assert.equal(reads, 1); assert.equal(report.vehicles.length, 3); assert.equal(new Set(report.vehicles.map((row) => row.vehicleId)).size, 3);
  const trip = report.vehicles.find((row) => row.vehicleId === ids[0])!; const gpsOnly = report.vehicles.find((row) => row.vehicleId === ids[1])!; const noGps = report.vehicles.find((row) => row.vehicleId === ids[2])!;
  assert.equal(trip.hasGpsData, true); assert.equal(trip.tripCount, 1); assert.equal(trip.tripDurationSeconds, 120); assert.equal(trip.stopCount, 1); assert.equal(trip.stopDurationSeconds, 300); assert.ok(trip.observedDistanceMeters > 1_000);
  assert.deepEqual({ hasGpsData: gpsOnly.hasGpsData, tripCount: gpsOnly.tripCount, distance: gpsOnly.observedDistanceMeters }, { hasGpsData: true, tripCount: 0, distance: 0 });
  assert.deepEqual({ hasGpsData: noGps.hasGpsData, raw: noGps.rawObservationCount }, { hasGpsData: false, raw: 0 });
  assert.equal(report.summary.vehicleCount, 3); assert.equal(report.summary.vehiclesWithGps, 2); assert.equal(report.summary.vehicleWithoutGpsCount, 1); assert.equal(report.summary.tripCount, 1); assert.equal(report.summary.totalTripDurationSeconds, 120);
  assert.deepEqual(report.vehicles.map((row) => row.vehicleId), [ids[0], ids[1], ids[2]]);
});

test("sorts GPS rows by distance, no-data last, and UUID as deterministic tie breaker", async () => { const service = new FleetActivityReportService({ getSnapshot: async () => ({ vehicles: [{ id: ids[2]!, name: "C", group: null }, { id: ids[1]!, name: "B", group: null }, { id: ids[0]!, name: "A", group: null }], observations: [observation(ids[1]!, 0, null), observation(ids[0]!, 0, null)] }) }, { getReportContext: async () => ({ timezone: "Europe/Kyiv", policy: DEFAULT_TRIP_STOP_ANALYTICS_POLICY }) } as any, unrestrictedScopes); const report = await service.getReport({ from, to }, testUserId); assert.deepEqual(report.vehicles.map((row) => row.vehicleId), [ids[0], ids[1], ids[2]]); });

test("report resolves one current trip/stop policy for every vehicle in its bounded snapshot", async () => { let reads = 0; const report = await new FleetActivityReportService({ getSnapshot: async () => ({ vehicles: [{ id: ids[0]!, name: "Trip", group: null }, { id: ids[1]!, name: "Also trip", group: null }], observations: [observation(ids[0]!, 0, 6), observation(ids[0]!, 60, 6), observation(ids[1]!, 0, 6), observation(ids[1]!, 60, 6)] }) }, { getReportContext: async () => { reads += 1; return { timezone: "Europe/Kyiv", policy: { ...DEFAULT_TRIP_STOP_ANALYTICS_POLICY, tripMovementSpeedKph: 7 } }; } } as any, unrestrictedScopes).getReport({ from, to }, testUserId); assert.equal(reads, 1); assert.equal(report.summary.tripCount, 0); });


const reportPolicy = { getReportContext: async () => ({ timezone: "Europe/Kyiv", policy: DEFAULT_TRIP_STOP_ANALYTICS_POLICY }) } as any;
function boundaryService() {
  return new FleetActivityReportService({ getSnapshot: async () => ({
    vehicles: ids.map((id, index) => ({ id, name: String(index), group: null })),
    // Deliberately broad fixture proves the Reports service protects its boundary
    // even if an alternate repository returns an endpoint observation.
    observations: [observation(ids[0]!, -1, 10), observation(ids[0]!, 0, 10), observation(ids[0]!, 60, 10), observation(ids[0]!, 86400, 10)],
  }) }, reportPolicy, unrestrictedScopes);
}
test("inclusive start and exclusive end exclude the next midnight without double counting adjacent days", async () => {
  const service = boundaryService();
  const first = await service.getReport({ from, to }, testUserId);
  const next = await service.getReport({ from: to, to: new Date(to.getTime() + 86400000) }, testUserId);
  assert.equal(first.vehicles[0]!.rawObservationCount, 2);
  assert.equal(next.vehicles[0]!.rawObservationCount, 1);
  assert.deepEqual(first.vehicles[0]!.firstObservationAt, from);
  assert.deepEqual(first.vehicles[0]!.lastObservationAt, new Date(from.getTime() + 60000));
  assert.deepEqual(next.vehicles[0]!.firstObservationAt, to);
});
test("zero length keeps all identities and produces no observations, episodes or gaps", async () => {
  const report = await boundaryService().getReport({ from, to: from }, testUserId);
  assert.equal(report.vehicles.length, 3);
  for (const row of report.vehicles) {
    assert.equal(row.hasGpsData, false);
    assert.equal(row.rawObservationCount + row.tripCount + row.stopCount + row.gapCount + row.gapDurationSeconds + row.observedDistanceMeters, 0);
    assert.equal(row.firstObservationAt, null); assert.equal(row.lastObservationAt, null);
  }
  assert.equal(report.summary.totalGapDurationSeconds, 0);
});
test("report rejects reversed and over-25h intervals before any reads", async () => {
  let reads = 0;
  const service = new FleetActivityReportService({ getSnapshot: async () => { reads++; throw Error("unexpected"); } }, reportPolicy, unrestrictedScopes);
  await assert.rejects(service.getReport({ from: to, to: from }, testUserId));
  await assert.rejects(service.getReport({ from, to: new Date(from.getTime() + 90000001) }, testUserId));
  assert.equal(reads, 0);
});
test("Kyiv spring 23h and autumn 25h calendar days remain valid", async () => {
  for (const [start, end] of [["2026-03-28T22:00:00Z", "2026-03-29T21:00:00Z"], ["2026-10-24T21:00:00Z", "2026-10-25T22:00:00Z"]]) {
    const report = await boundaryService().getReport({ from: new Date(start!), to: new Date(end!) }, testUserId);
    assert.equal(report.timezone, "Europe/Kyiv");
  }
});
test("returns captured generation time, actual policy, nullable bounds and internal gap duration from core", async () => {
  const generatedAt = new Date("2026-09-07T12:00:00Z");
  const report = await new FleetActivityReportService({ getSnapshot: async () => ({
    vehicles: ids.map((id) => ({ id, name: id, group: null })),
    observations: [observation(ids[0]!, 60, null), observation(ids[0]!, 660, null), observation(ids[0]!, 1560, null), observation(ids[1]!, 60, null)],
  }) }, reportPolicy, unrestrictedScopes).getReport({ from, to }, testUserId, generatedAt);
  assert.deepEqual(report.generatedAt, generatedAt); assert.notEqual(report.generatedAt, generatedAt);
  assert.deepEqual(report.policy, DEFAULT_TRIP_STOP_ANALYTICS_POLICY);
  const row = report.vehicles.find((v) => v.vehicleId === ids[0])!;
  assert.equal(row.gapCount, 2); assert.equal(row.gapDurationSeconds, 1500);
  assert.equal(report.summary.totalGapDurationSeconds, 1500);
  assert.deepEqual(row.firstObservationAt, new Date(from.getTime() + 60000));
  assert.deepEqual(row.lastObservationAt, new Date(from.getTime() + 1560000));
  const noGps = report.vehicles.find((v) => v.vehicleId === ids[2])!;
  assert.equal(noGps.firstObservationAt, null); assert.equal(noGps.lastObservationAt, null);
});
test("default generation timestamp is captured within the request", async () => {
  const before = Date.now(); const report = await boundaryService().getReport({ from, to }, testUserId);
  assert.ok(report.generatedAt.getTime() >= before && report.generatedAt.getTime() <= Date.now());
});


test("report context reads timezone and policy together without leaking settings or changing Trips lookup", async () => {
  const { TripStopAnalyticsPolicyService } = await import("../trip-stop-analytics/trip-stop-analytics-policy.service");
  const calls: any[] = [];
  const settings = { ...DEFAULT_TRIP_STOP_ANALYTICS_POLICY, timezone: "Europe/Kyiv", revision: 99, internalSecret: "never-public" };
  const policy = new TripStopAnalyticsPolicyService({ getClient: () => ({ applicationSettings: { findUnique: async (query: any) => { calls.push(query); return settings; } } }) } as any);
  assert.deepEqual(await policy.getReportContext(), { timezone: settings.timezone, policy: DEFAULT_TRIP_STOP_ANALYTICS_POLICY });
  assert.equal(calls.length, 1); assert.equal(calls[0].select.timezone, true);
  assert.equal("revision" in calls[0].select, false);
  assert.deepEqual(await policy.getSnapshot(), DEFAULT_TRIP_STOP_ANALYTICS_POLICY);
  assert.equal("timezone" in calls[1].select, false);
});
