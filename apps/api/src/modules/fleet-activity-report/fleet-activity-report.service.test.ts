import assert from "node:assert/strict";
import test from "node:test";
import { FleetActivityReportService } from "./fleet-activity-report.service";
import type { FleetActivityReportRepository } from "./fleet-activity-report.types";

const from = new Date("2026-08-01T00:00:00Z"); const to = new Date("2026-08-02T00:00:00Z");
const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"];
const observation = (vehicleId: string, seconds: number, speedKph: number | null, latitude = 49) => ({ vehicleId, observedAt: new Date(from.getTime() + seconds * 1_000), fixFingerprint: `${vehicleId}-${seconds}`, latitude, longitude: 28, speedKph, valid: true, outdated: false });

test("groups one bounded snapshot and aggregates the authoritative Stage 15A core for every persisted vehicle", async () => {
  let reads = 0; const repository: FleetActivityReportRepository = { getSnapshot: async () => { reads += 1; return { vehicles: [{ id: ids[0]!, name: "Trip" }, { id: ids[1]!, name: "GPS only" }, { id: ids[2]!, name: "No GPS" }], observations: [observation(ids[1]!, 0, null), observation(ids[0]!, 0, 10), observation(ids[0]!, 60, 10, 49.01), observation(ids[0]!, 120, 0, 49.01), observation(ids[0]!, 420, 0, 49.01)] }; } };
  const report = await new FleetActivityReportService(repository).getReport({ from, to });
  assert.equal(reads, 1); assert.equal(report.vehicles.length, 3); assert.equal(new Set(report.vehicles.map((row) => row.vehicleId)).size, 3);
  const trip = report.vehicles.find((row) => row.vehicleId === ids[0])!; const gpsOnly = report.vehicles.find((row) => row.vehicleId === ids[1])!; const noGps = report.vehicles.find((row) => row.vehicleId === ids[2])!;
  assert.equal(trip.hasGpsData, true); assert.equal(trip.tripCount, 1); assert.equal(trip.tripDurationSeconds, 120); assert.equal(trip.stopCount, 1); assert.equal(trip.stopDurationSeconds, 300); assert.ok(trip.observedDistanceMeters > 1_000);
  assert.deepEqual({ hasGpsData: gpsOnly.hasGpsData, tripCount: gpsOnly.tripCount, distance: gpsOnly.observedDistanceMeters }, { hasGpsData: true, tripCount: 0, distance: 0 });
  assert.deepEqual({ hasGpsData: noGps.hasGpsData, raw: noGps.rawObservationCount }, { hasGpsData: false, raw: 0 });
  assert.equal(report.summary.vehicleCount, 3); assert.equal(report.summary.vehiclesWithGps, 2); assert.equal(report.summary.vehicleWithoutGpsCount, 1); assert.equal(report.summary.tripCount, 1); assert.equal(report.summary.totalTripDurationSeconds, 120);
  assert.deepEqual(report.vehicles.map((row) => row.vehicleId), [ids[0], ids[1], ids[2]]);
});

test("sorts GPS rows by distance, no-data last, and UUID as deterministic tie breaker", async () => { const service = new FleetActivityReportService({ getSnapshot: async () => ({ vehicles: [{ id: ids[2]!, name: "C" }, { id: ids[1]!, name: "B" }, { id: ids[0]!, name: "A" }], observations: [observation(ids[1]!, 0, null), observation(ids[0]!, 0, null)] }) }); const report = await service.getReport({ from, to }); assert.deepEqual(report.vehicles.map((row) => row.vehicleId), [ids[0], ids[1], ids[2]]); });
