import assert from "node:assert/strict";
import test from "node:test";
import { AuthRole, VehicleAccessMode } from "../../generated/prisma/enums";
import type { DatabaseService } from "../database/database.service";
import { applyAlertEventScope, applyObservationScope, applyVehicleScope, selectedVehicleWhere, UNRESTRICTED_VEHICLE_SCOPE, VehicleScopeService } from "./vehicle-access.service";
import type { VehicleScope } from "./vehicle-access.types";

const adminId = "00000000-0000-4000-8000-000000000011";
const allUserId = "00000000-0000-4000-8000-000000000012";
const selectedUserId = "00000000-0000-4000-8000-000000000013";
const vehicleA = "00000000-0000-4000-8000-0000000000a1";
const vehicleB = "00000000-0000-4000-8000-0000000000b2";

function authority(role: AuthRole | null, mode: VehicleAccessMode = VehicleAccessMode.ALL) {
  const client = { authUser: { findUnique: async () => (role === null ? null : { role, vehicleAccessMode: mode }) }, vehicle: { count: async () => 0 } };
  return new VehicleScopeService({ getClient: () => client } as unknown as DatabaseService);
}

test("B1 ADMIN retains full-fleet behavior", async () => {
  assert.deepEqual(await authority(AuthRole.ADMIN, VehicleAccessMode.SELECTED).resolve(adminId), { kind: "UNRESTRICTED" });
  assert.deepEqual(applyVehicleScope(UNRESTRICTED_VEHICLE_SCOPE, { disabled: false }), { disabled: false });
  assert.deepEqual(applyAlertEventScope(UNRESTRICTED_VEHICLE_SCOPE, { vehicleId: vehicleA }), { vehicleId: vehicleA });
  assert.deepEqual(applyObservationScope(UNRESTRICTED_VEHICLE_SCOPE, { vehicleId: vehicleA }), { vehicleId: vehicleA });
});

test("B1 USER + ALL retains full-fleet behavior", async () => {
  assert.deepEqual(await authority(AuthRole.USER, VehicleAccessMode.ALL).resolve(allUserId), { kind: "UNRESTRICTED" });
});

test("B1 USER + SELECTED uses one canonical group-or-direct predicate", async () => {
  const scope = await authority(AuthRole.USER, VehicleAccessMode.SELECTED).resolve(selectedUserId);
  assert.equal(scope.kind, "FILTERED");
  assert.deepEqual(scope.kind === "FILTERED" ? scope.where : null, selectedVehicleWhere(selectedUserId));
  const vehicleWhere = applyVehicleScope(scope, { id: vehicleA });
  assert.deepEqual(vehicleWhere, { AND: [{ id: vehicleA }, selectedVehicleWhere(selectedUserId)] });
  const eventWhere = applyAlertEventScope(scope, { vehicleId: vehicleA });
  assert.deepEqual(eventWhere, { AND: [{ vehicleId: vehicleA }, { vehicle: selectedVehicleWhere(selectedUserId) }] });
  const obsWhere = applyObservationScope(scope, { vehicleId: vehicleA });
  assert.deepEqual(obsWhere, { AND: [{ vehicleId: vehicleA }, { vehicle: selectedVehicleWhere(selectedUserId) }] });
});

test("B1 SELECTED with zero grants is a valid empty scope, not an error", async () => {
  const scope: VehicleScope = { kind: "FILTERED", where: selectedVehicleWhere(selectedUserId) };
  assert.deepEqual(applyVehicleScope(scope, {}), { AND: [{}, selectedVehicleWhere(selectedUserId)] });
});

test("B1 dynamic group membership uses live userId predicate without copied grants", async () => {
  const before = selectedVehicleWhere(selectedUserId);
  assert.ok(JSON.stringify(before).includes(selectedUserId));
  assert.equal(JSON.stringify(before).includes(vehicleA), false);
  assert.equal(JSON.stringify(before).includes(vehicleB), false);
});
test("B1 direct vehicle reads fail closed as not-found for unauthorized vehicles", async () => {
  const { VehicleDetailsQueryService } = await import("../vehicle-details/vehicle-details-query.service");
  const { VehicleDetailsNotFoundError } = await import("../vehicle-details/vehicle-details.types");
  const filtered: VehicleScope = { kind: "FILTERED", where: selectedVehicleWhere(selectedUserId) };
  const scopes = { resolve: async () => filtered } as unknown as VehicleScopeService;
  const missingRepository = { getSnapshot: async () => ({ timezone: "Europe/Kyiv", positionFreshnessSeconds: 300, serviceDate: new Date("2026-07-01T00:00:00.000Z"), vehicle: null, activeAlerts: [], activeAlertsExceededLimit: false, recentEvents: [] }) };
  const service = new VehicleDetailsQueryService(missingRepository as never, { now: () => new Date() } as never, scopes);
  await assert.rejects(service.getDetails(vehicleA, selectedUserId), VehicleDetailsNotFoundError);
});

test("B1 collection and aggregate helpers never leak unauthorized vehicles", async () => {
  const filtered: VehicleScope = { kind: "FILTERED", where: selectedVehicleWhere(selectedUserId) };
  const vehicleWhere = applyVehicleScope(filtered, { alertEvents: { some: {} } });
  assert.deepEqual(vehicleWhere, { AND: [{ alertEvents: { some: {} } }, selectedVehicleWhere(selectedUserId)] });
  const eventWhere = applyAlertEventScope(filtered, { status: "OPEN" as never });
  assert.ok(JSON.stringify(eventWhere).includes(selectedUserId));
  assert.equal(JSON.stringify(eventWhere).includes(vehicleA), false);
});

test("B1 functional permissions remain independent from vehicle scope", async () => {
  const { DashboardController } = await import("../dashboard/dashboard.controller");
  const { FleetMapController } = await import("../fleet-map/fleet-map.controller");
  const { AlertEventsController } = await import("../alert-events/alert-events.controller");
  const dashboardPermissions = Reflect.getMetadata("auth:permissions", DashboardController) ?? Reflect.getMetadata("auth:permissions", DashboardController.prototype.getVehicles);
  const fleetMapPermissions = Reflect.getMetadata("auth:permissions", FleetMapController) ?? Reflect.getMetadata("auth:permissions", FleetMapController.prototype.getSnapshot);
  assert.deepEqual(dashboardPermissions, ["fleet.view"]);
  assert.deepEqual(fleetMapPermissions, ["map.view"]);
  assert.deepEqual(Reflect.getMetadata("auth:permissions", AlertEventsController.prototype.list), ["events.view"]);
});

test("B1 history admin remains intentionally global", async () => {
  const { PositionHistoryStatusController } = await import("../position-history-status/position-history-status.controller");
  const permissions = Reflect.getMetadata("auth:permissions", PositionHistoryStatusController);
  assert.deepEqual(permissions, ["historyAdmin.view"]);
  const { PositionHistoryStatusModule } = await import("../position-history-status/position-history-status.module");
  const imports = (Reflect.getMetadata("imports", PositionHistoryStatusModule) ?? []) as readonly unknown[];
  const names = imports.map((value) => (value as { name?: string }).name ?? String(value));
  assert.equal(names.includes("VehicleAccessModule"), false);
});
test("B1 fleet dashboard rows and headline counts represent the authorized fleet only", async () => {
  const { DashboardQueryService } = await import("../dashboard/dashboard-query.service");
  const { parseDashboardQueryParams } = await import("../dashboard/dashboard-query-params");
  const filtered: VehicleScope = { kind: "FILTERED", where: selectedVehicleWhere(selectedUserId) };
  let capturedScope: unknown;
  const repository = {
    getSettings: async () => ({ timezone: "UTC", minimumDailyDistanceMeters: 500, positionFreshnessSeconds: 300 }),
    getVehiclesForServiceDate: async (_date: string, scope: VehicleScope) => { capturedScope = scope; return []; },
  };
  const scopes = { resolve: async (userId: string) => { assert.equal(userId, selectedUserId); return filtered; } } as unknown as VehicleScopeService;
  const service = new DashboardQueryService(repository as never, { now: () => new Date("2026-08-05T12:00:00.000Z") } as never, scopes);
  const response = await service.getVehicles(parseDashboardQueryParams({}), selectedUserId);
  assert.deepEqual(capturedScope, filtered);
  assert.deepEqual(response.summary, { total: 0, online: 0, offline: 0, unknown: 0, freshPositions: 0, stalePositions: 0, withoutPosition: 0, belowMinimumDistance: 0, withoutDailyStat: 0 });
  assert.deepEqual(response.vehicles, []);
});

test("B1 fleet map snapshot is scoped and safety limits operate on the authorized result", async () => {
  const { FleetMapQueryService } = await import("../fleet-map/fleet-map-query.service");
  const filtered: VehicleScope = { kind: "FILTERED", where: selectedVehicleWhere(selectedUserId) };
  let capturedScope: unknown;
  const repository = { getSnapshot: async (scope: VehicleScope) => { capturedScope = scope; return { positionFreshnessSeconds: 300, vehicles: [] }; } };
  const scopes = { resolve: async () => filtered } as unknown as VehicleScopeService;
  const service = new FleetMapQueryService(repository as never, { now: () => new Date("2026-08-09T12:00:00.000Z") } as never, scopes);
  const response = await service.getSnapshot(selectedUserId);
  assert.deepEqual(capturedScope, filtered);
  assert.deepEqual(response.summary, { totalVehicles: 0, withPosition: 0, withoutPosition: 0, invalidPosition: 0, fresh: 0, stale: 0 });
});

test("B1 events list, summary, options and map are all scoped", async () => {
  const { AlertEventsQueryService } = await import("../alert-events/alert-events-query.service");
  const filtered: VehicleScope = { kind: "FILTERED", where: selectedVehicleWhere(selectedUserId) };
  const seen: Record<string, unknown[]> = { list: [], summary: [], options: [], map: [] };
  const repository = {
    list: async (params: unknown, scope: VehicleScope) => { seen.list?.push(scope); return { rows: [], hasMore: false }; },
    getOpenSummary: async (scope: VehicleScope) => { seen.summary?.push(scope); return { speeding: 0, inactivity: 0 }; },
    getVehicleOptions: async (scope: VehicleScope) => { seen.options?.push(scope); return []; },
    getOpenMapSnapshot: async (scope: VehicleScope) => { seen.map?.push(scope); return { rows: [], exceededLimit: false }; },
  };
  const scopes = { resolve: async () => filtered } as unknown as VehicleScopeService;
  const service = new AlertEventsQueryService(repository as never, { now: () => new Date() } as never, scopes);
  const params = { status: undefined, type: undefined, vehicleId: undefined, limit: 10, cursor: undefined };
  assert.deepEqual((await service.list(params as never, selectedUserId)).items, []);
  assert.deepEqual((await service.getSummary(selectedUserId)).open, { total: 0, speeding: 0, inactivity: 0 });
  assert.deepEqual(await service.getVehicleOptions(selectedUserId), []);
  assert.equal((await service.getOpenMap(selectedUserId)).summary.vehiclesWithOpenAlerts, 0);
  for (const key of ["list", "summary", "options", "map"] as const) assert.deepEqual(seen[key]?.[0], filtered);
});

test("B1 reports operate only on the authorized fleet and its observations", async () => {
  const { FleetActivityReportService } = await import("../fleet-activity-report/fleet-activity-report.service");
  const filtered: VehicleScope = { kind: "FILTERED", where: selectedVehicleWhere(selectedUserId) };
  let capturedScope: unknown;
  const repository = { getSnapshot: async (_range: unknown, scope: VehicleScope) => { capturedScope = scope; return { vehicles: [], observations: [] }; } };
  const policy = { getReportContext: async () => ({ timezone: "UTC", policy: (await import("../trip-stop-analytics")).DEFAULT_TRIP_STOP_ANALYTICS_POLICY }) };
  const scopes = { resolve: async () => filtered } as unknown as VehicleScopeService;
  const service = new FleetActivityReportService(repository as never, policy as never, scopes);
  const from = new Date("2026-08-01T00:00:00.000Z");
  const to = new Date("2026-08-02T00:00:00.000Z");
  const report = await service.getReport({ from, to }, selectedUserId);
  assert.deepEqual(capturedScope, filtered);
  assert.deepEqual(report.summary, { vehicleCount: 0, vehiclesWithGps: 0, vehicleWithoutGpsCount: 0, tripCount: 0, totalObservedDistanceMeters: 0, totalTripDurationSeconds: 0, gapCount: 0, totalGapDurationSeconds: 0 });
  assert.deepEqual(report.vehicles, []);
});
test("B1 trips, track and movement history fail closed for unauthorized vehicles", async () => {
  const filtered: VehicleScope = { kind: "FILTERED", where: selectedVehicleWhere(selectedUserId) };
  const scopes = { resolve: async () => filtered } as unknown as VehicleScopeService;
  const from = new Date("2026-08-10T10:00:00.000Z");
  const to = new Date("2026-08-10T11:00:00.000Z");
  const { VehicleTrackQueryService } = await import("../vehicle-track/vehicle-track-query.service");
  const { VehicleTrackNotFoundError } = await import("../vehicle-track/vehicle-track.types");
  const track = new VehicleTrackQueryService({ getSnapshot: async () => ({ vehicle: null, points: [] }) } as never, { now: () => new Date() } as never, scopes);
  await assert.rejects(track.getTrack(vehicleA, from, to, selectedUserId), VehicleTrackNotFoundError);
  const { VehicleTrackOverviewQueryService } = await import("../vehicle-track/vehicle-track-overview-query.service");
  const { VehicleTrackOverviewNotFoundError } = await import("../vehicle-track/vehicle-track-overview.types");
  const overview = new VehicleTrackOverviewQueryService({ getOverviewSnapshot: async () => ({ vehicle: null, rawPointCount: 0, segmentCount: 0, qualityWarningCount: 0, firstObservedAt: null, lastObservedAt: null, tooFragmented: false, points: [] }) } as never, { now: () => new Date() } as never, scopes);
  await assert.rejects(overview.getOverview(vehicleA, from, to, selectedUserId), VehicleTrackOverviewNotFoundError);
  const { TripStopAnalyticsService } = await import("../trip-stop-analytics/trip-stop-analytics.service");
  const { TripStopAnalyticsVehicleNotFoundError } = await import("../trip-stop-analytics/trip-stop-analytics.errors");
  const trips = new TripStopAnalyticsService({ getSnapshot: async () => ({ vehicle: null, observations: [] }) } as never, { getSnapshot: async () => (await import("../trip-stop-analytics")).DEFAULT_TRIP_STOP_ANALYTICS_POLICY } as never, scopes);
  await assert.rejects(trips.analyze(vehicleA, { from, to }, selectedUserId), TripStopAnalyticsVehicleNotFoundError);
});

test("B1 access changes apply on the next request without session refresh", async () => {
  let calls = 0;
  const scopes = { resolve: async (userId: string) => { calls += 1; assert.equal(userId, selectedUserId); return calls === 1 ? UNRESTRICTED_VEHICLE_SCOPE : { kind: "FILTERED", where: selectedVehicleWhere(selectedUserId) } as VehicleScope; } } as unknown as VehicleScopeService;
  const { DashboardQueryService } = await import("../dashboard/dashboard-query.service");
  const { parseDashboardQueryParams } = await import("../dashboard/dashboard-query-params");
  const repository = {
    getSettings: async () => ({ timezone: "UTC", minimumDailyDistanceMeters: 1, positionFreshnessSeconds: 300 }),
    getVehiclesForServiceDate: async () => [],
  };
  const service = new DashboardQueryService(repository as never, { now: () => new Date("2026-08-05T12:00:00.000Z") } as never, scopes);
  await service.getVehicles(parseDashboardQueryParams({}), selectedUserId);
  await service.getVehicles(parseDashboardQueryParams({}), selectedUserId);
  assert.equal(calls, 2);
});
