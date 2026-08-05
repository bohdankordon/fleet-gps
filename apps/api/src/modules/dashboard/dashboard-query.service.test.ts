import assert from "node:assert/strict";
import test from "node:test";
import { DailyStatSource, DataQuality, VehicleStatus } from "../../generated/prisma/client";
import type { DashboardQueryRepository, DashboardStoredVehicle } from "./dashboard-query.repository";
import { parseDashboardQueryParams } from "./dashboard-query-params";
import { DashboardQueryService } from "./dashboard-query.service";

const now = new Date("2026-08-05T21:30:00.000Z");
const rows: readonly DashboardStoredVehicle[] = [
  { id: "b", name: " beta ", disabled: true, currentState: { status: VehicleStatus.OFFLINE, externalLastUpdateAt: null, fixTime: null, speedKph: null, valid: null, outdated: null }, dailyStat: null },
  { id: "a", name: "Alpha", disabled: false, currentState: { status: VehicleStatus.ONLINE, externalLastUpdateAt: new Date("2026-08-05T21:00:00.000Z"), fixTime: new Date("2026-08-05T21:29:00.000Z"), speedKph: 33.5, valid: true, outdated: false }, dailyStat: { distanceMeters: { toNumber: () => 500 }, source: DailyStatSource.RUNS, quality: DataQuality.PROVISIONAL, isStale: false, isDegraded: false } },
  { id: "c", name: "alpha", disabled: false, currentState: { status: VehicleStatus.UNKNOWN, externalLastUpdateAt: null, fixTime: new Date("2026-08-05T21:31:30.000Z"), speedKph: null, valid: false, outdated: true }, dailyStat: { distanceMeters: { toNumber: () => 499.99 }, source: DailyStatSource.MODE1, quality: DataQuality.EXACT, isStale: false, isDegraded: false } },
];
function createService(repository: DashboardQueryRepository, clock = { now: (): Date => now }): DashboardQueryService { return new DashboardQueryService(repository, clock); }

test("builds a filtered read model for Kyiv date without external identifiers or coordinates", async () => {
  let queriedDate = ""; let clockCalls = 0;
  const service = createService({ getSettings: async () => ({ timezone: "Europe/Kyiv", minimumDailyDistanceMeters: 500, positionFreshnessSeconds: 300 }), getVehiclesForServiceDate: async (date) => { queriedDate = date; return rows; } }, { now: (): Date => { clockCalls += 1; return now; } });
  const result = await service.getVehicles(parseDashboardQueryParams({}));
  assert.equal(clockCalls, 1); assert.equal(queriedDate, "2026-08-06"); assert.equal(result.generatedAt, now.toISOString());
  assert.deepEqual(result.vehicles.map((item) => item.id), ["a", "c", "b"]);
  assert.equal(result.vehicles[0]?.belowMinimumDistance, false);
  assert.equal(result.vehicles[1]?.belowMinimumDistance, true);
  assert.equal(result.vehicles[1]?.positionFreshness, "future");
  assert.equal(result.vehicles[2]?.positionFreshness, "missing");
  assert.deepEqual(result.summary, { total: 3, online: 1, offline: 1, unknown: 1, freshPositions: 1, stalePositions: 1, withoutPosition: 1, belowMinimumDistance: 1, withoutDailyStat: 1 });
  assert.equal(JSON.stringify(result).includes("externalDeviceId"), false); assert.equal(JSON.stringify(result).includes("latitude"), false);
});

test("filters by activity, status, case-insensitive search and disabled state", async () => {
  const repository: DashboardQueryRepository = { getSettings: async () => ({ timezone: "UTC", minimumDailyDistanceMeters: 500, positionFreshnessSeconds: 300 }), getVehiclesForServiceDate: async () => rows };
  const service = createService(repository);
  assert.deepEqual((await service.getVehicles(parseDashboardQueryParams({ activity: "no_data" }))).vehicles.map((item) => item.id), ["b"]);
  assert.deepEqual((await service.getVehicles(parseDashboardQueryParams({ activity: "below_threshold", includeDisabled: "false" }))).vehicles.map((item) => item.id), ["c"]);
  assert.deepEqual((await service.getVehicles(parseDashboardQueryParams({ status: "online", search: " ALP " }))).vehicles.map((item) => item.id), ["a"]);
});

test("classifies future fix times deterministically", async () => {
  const repository: DashboardQueryRepository = { getSettings: async () => ({ timezone: "UTC", minimumDailyDistanceMeters: 1, positionFreshnessSeconds: 300 }), getVehiclesForServiceDate: async () => [{ ...rows[0]!, disabled: false, currentState: { ...rows[0]!.currentState!, fixTime: new Date("2026-08-05T21:31:01.000Z") } }] };
  const result = await createService(repository).getVehicles(parseDashboardQueryParams({}));
  assert.equal(result.vehicles[0]?.positionFreshness, "future"); assert.equal(result.summary.stalePositions, 1);
});

test("does not expose an invalid configured timezone", async () => {
  const service = createService({ getSettings: async () => ({ timezone: "invalid timezone", minimumDailyDistanceMeters: 1, positionFreshnessSeconds: 1 }), getVehiclesForServiceDate: async () => [] });
  await assert.rejects(service.getVehicles(parseDashboardQueryParams({})), (error: unknown) => error instanceof Error && !error.message.includes("invalid timezone"));
});
