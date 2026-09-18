import assert from "node:assert/strict";
import test from "node:test";
import { AlertEventSpeedZone, AlertEventStatus, AlertEventType, AlertNotificationStatus, DailyStatSource, DataQuality, VehicleStatus } from "../../generated/prisma/client";
import { AlertEventsQueryService } from "../alert-events/alert-events-query.service";
import type { StoredAlertEventProjectionRow } from "../alert-events/alert-events-query.repository";
import { FleetMapQueryService } from "../fleet-map/fleet-map-query.service";
import type { StoredVehicleDetailsSnapshot, VehicleDetailsQueryRepository } from "./vehicle-details-query.repository";
import { VehicleDetailsQueryService } from "./vehicle-details-query.service";
import { UNRESTRICTED_VEHICLE_SCOPE } from "../vehicle-access/vehicle-access.service"; import { VehicleDetailsNotFoundError } from "./vehicle-details.types";

const testUserId = "00000000-0000-4000-8000-000000000099"; const unrestrictedScopes = { resolve: async () => UNRESTRICTED_VEHICLE_SCOPE } as unknown as import("../vehicle-access/vehicle-access.service").VehicleScopeService; const VEHICLE_ID = "00000000-0000-4000-8000-000000000001";
const EVENT_ID = "00000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-06-30T21:00:01.000Z");
const CURRENT = Object.freeze({ status: VehicleStatus.ONLINE, fixTime: new Date("2026-06-30T20:59:01.000Z"), latitude: 49.2331, longitude: 28.4682, speedKph: 32.5, valid: true, outdated: false });

function speedingEvent(overrides: Partial<StoredAlertEventProjectionRow> = {}): StoredAlertEventProjectionRow {
  return {
    id: EVENT_ID, type: AlertEventType.SPEEDING, status: AlertEventStatus.OPEN, confirmedAt: new Date("2026-06-30T20:00:00.000Z"), resolvedAt: null,
    speedZone: AlertEventSpeedZone.CITY, confirmationSpeedKph: 72, lastSpeedKph: 75, peakSpeedKph: 81, speedThresholdKph: 60,
    confirmationTraveledDistanceMeters: null, lastTraveledDistanceMeters: null, minimumTraveledDistanceMeters: null, distanceThresholdMeters: null, durationThresholdMinutes: null,
    notificationOutbox: [], ...overrides,
  };
}

function inactivityEvent(overrides: Partial<StoredAlertEventProjectionRow> = {}): StoredAlertEventProjectionRow {
  return speedingEvent({
    id: "00000000-0000-4000-8000-000000000003", type: AlertEventType.INACTIVITY, status: AlertEventStatus.RESOLVED, resolvedAt: new Date("2026-06-30T20:30:00.000Z"),
    speedZone: null, confirmationSpeedKph: null, lastSpeedKph: null, peakSpeedKph: null, speedThresholdKph: null,
    confirmationTraveledDistanceMeters: 12, lastTraveledDistanceMeters: 350, minimumTraveledDistanceMeters: 8, distanceThresholdMeters: 300, durationThresholdMinutes: 60,
    ...overrides,
  });
}

function snapshot(overrides: Partial<StoredVehicleDetailsSnapshot> = {}): StoredVehicleDetailsSnapshot {
  return {
    timezone: "Europe/Kyiv",
    positionFreshnessSeconds: 300,
    serviceDate: new Date("2026-07-01T00:00:00.000Z"),
    vehicle: { id: VEHICLE_ID, name: "Taxi 7", disabled: false, group: null, currentState: CURRENT, dailyStat: { distanceMeters: 12345.67, movementDurationSeconds: 3600, maxSpeedKph: 87.125, source: DailyStatSource.MODE1, quality: DataQuality.EXACT, isStale: false, isDegraded: false } },
    activeAlerts: [], activeAlertsExceededLimit: false, recentEvents: [], ...overrides,
  };
}

function subject(value: StoredVehicleDetailsSnapshot, calls?: string[]): VehicleDetailsQueryService {
  const repository: VehicleDetailsQueryRepository = { getSnapshot: async () => { calls?.push("repository"); return value; } };
  return new VehicleDetailsQueryService(repository, { now: () => { calls?.push("clock"); return NOW; } }, unrestrictedScopes);
}

test("returns the allow-listed vehicle, current state, Kyiv operational today, and empty alert states", async () => {
  const response = await subject(snapshot()).getDetails(VEHICLE_ID, testUserId);
  assert.deepEqual(response, {
    generatedAt: NOW.toISOString(), vehicle: { id: VEHICLE_ID, name: "Taxi 7", disabled: false, group: null }, connectivity: "ONLINE",
    currentState: { position: { latitude: 49.2331, longitude: 28.4682, observedAt: "2026-06-30T20:59:01.000Z" }, speedKph: 32.5, freshness: "FRESH" },
    today: { date: "2026-07-01", distanceMeters: 12345.67, movementDurationSeconds: 3600, maxSpeedKph: 87.125, source: "MODE1", quality: "EXACT", isStale: false, isDegraded: false },
    activeAlerts: [], recentEvents: [],
  });
});

test("missing CurrentState and missing DailyVehicleStat are normal null states", async () => {
  const value = snapshot({ vehicle: { id: VEHICLE_ID, name: "Taxi 7", disabled: true, group: null, currentState: null, dailyStat: null } });
  const response = await subject(value).getDetails(VEHICLE_ID, testUserId);
  assert.equal(response.currentState, null);
  assert.equal(response.today, null);
  assert.equal(response.vehicle.disabled, true);
  assert.equal(response.connectivity, "UNKNOWN");
});

test("projects connectivity independently when provider position is unusable", async () => {
  const response = await subject(snapshot({ vehicle: { ...snapshot().vehicle!, disabled: true, currentState: { ...CURRENT, status: VehicleStatus.OFFLINE, fixTime: null, latitude: null, longitude: null } } })).getDetails(VEHICLE_ID, testUserId);
  assert.equal(response.currentState, null);
  assert.equal(response.connectivity, "OFFLINE");
  assert.equal(response.vehicle.disabled, true);
});

test("unknown valid vehicle is a typed not-found after the repository snapshot", async () => {
  await assert.rejects(subject(snapshot({ vehicle: null })).getDetails(VEHICLE_ID, testUserId), VehicleDetailsNotFoundError);
});

test("reuses fleet-map coordinate boundaries, invalid-position, speed, and freshness semantics", async () => {
  for (const [latitude, longitude] of [[-90, -180], [-90, 180], [90, -180], [90, 180]] as const) {
    const value = snapshot({ vehicle: { ...snapshot().vehicle!, currentState: { ...CURRENT, latitude, longitude } } });
    assert.deepEqual((await subject(value).getDetails(VEHICLE_ID, testUserId)).currentState?.position, { latitude, longitude, observedAt: CURRENT.fixTime.toISOString() });
  }
  for (const currentState of [{ ...CURRENT, latitude: 91 }, { ...CURRENT, longitude: Number.NaN }, { ...CURRENT, fixTime: new Date(Number.NaN) }]) {
    assert.equal((await subject(snapshot({ vehicle: { ...snapshot().vehicle!, currentState } })).getDetails(VEHICLE_ID, testUserId)).currentState, null);
  }
  assert.equal((await subject(snapshot({ vehicle: { ...snapshot().vehicle!, currentState: { ...CURRENT, speedKph: null } } })).getDetails(VEHICLE_ID, testUserId)).currentState?.speedKph, null);
  assert.equal((await subject(snapshot({ vehicle: { ...snapshot().vehicle!, currentState: { ...CURRENT, speedKph: -1 } } })).getDetails(VEHICLE_ID, testUserId)).currentState?.speedKph, null);
  assert.equal((await subject(snapshot({ vehicle: { ...snapshot().vehicle!, currentState: { ...CURRENT, valid: false } } })).getDetails(VEHICLE_ID, testUserId)).currentState?.speedKph, null);
});

test("freshness is inclusive at the boundary and stale beyond it or for provider state", async () => {
  const state = (fixTime: string, valid = true, outdated: boolean | null = false) => ({ ...CURRENT, fixTime: new Date(fixTime), valid, outdated });
  const values = [state("2026-06-30T20:55:01.000Z"), state("2026-06-30T20:55:00.999Z"), state("2026-06-30T21:00:01.001Z"), state("2026-06-30T20:59:01.000Z", false), state("2026-06-30T20:59:01.000Z", true, true)];
  const results = [];
  for (const currentState of values) results.push((await subject(snapshot({ vehicle: { ...snapshot().vehicle!, currentState } })).getDetails(VEHICLE_ID, testUserId)).currentState?.freshness);
  assert.deepEqual(results, ["FRESH", "STALE", "STALE", "STALE", "STALE"]);
});

test("captures generatedAt exactly once after the complete repository read", async () => {
  const calls: string[] = [];
  let clockCalls = 0;
  const repository: VehicleDetailsQueryRepository = { getSnapshot: async () => { calls.push("repository"); return snapshot(); } };
  const query = new VehicleDetailsQueryService(repository, { now: () => { calls.push("clock"); clockCalls += 1; return NOW; } }, unrestrictedScopes);
  assert.equal((await query.getDetails(VEHICLE_ID, testUserId)).generatedAt, NOW.toISOString());
  assert.deepEqual(calls, ["repository", "clock"]);
  assert.equal(clockCalls, 1);
});

test("maps both OPEN alert types deterministically and rejects duplicate or over-limit persisted OPEN state", async () => {
  const response = await subject(snapshot({ activeAlerts: [
    { type: AlertEventType.INACTIVITY, confirmedAt: new Date("2026-06-30T19:00:00.000Z") },
    { type: AlertEventType.SPEEDING, confirmedAt: new Date("2026-06-30T20:00:00.000Z") },
  ] })).getDetails(VEHICLE_ID, testUserId);
  assert.deepEqual(response.activeAlerts, [
    { type: "SPEEDING", openedAt: "2026-06-30T20:00:00.000Z" },
    { type: "INACTIVITY", openedAt: "2026-06-30T19:00:00.000Z" },
  ]);
  await assert.rejects(subject(snapshot({ activeAlertsExceededLimit: true })).getDetails(VEHICLE_ID, testUserId));
  await assert.rejects(subject(snapshot({ activeAlerts: [{ type: AlertEventType.SPEEDING, confirmedAt: NOW }, { type: AlertEventType.SPEEDING, confirmedAt: NOW }] })).getDetails(VEHICLE_ID, testUserId));
});

test("recent events reuse type-specific and notification projections without repeated vehicle data", async () => {
  const recentEvents = [speedingEvent({ notificationOutbox: [{ status: AlertNotificationStatus.SENDING }] }), inactivityEvent({ notificationOutbox: [{ status: AlertNotificationStatus.SENT }] })];
  const response = await subject(snapshot({ recentEvents })).getDetails(VEHICLE_ID, testUserId);
  assert.deepEqual(response.recentEvents.map((event) => [event.type, event.status, event.notificationDeliveryStatus]), [["SPEEDING", "OPEN", "PENDING"], ["INACTIVITY", "RESOLVED", "SENT"]]);
  assert.deepEqual(response.recentEvents[0]?.details, { zone: "CITY", confirmationSpeedKph: 72, lastSpeedKph: 75, peakSpeedKph: 81, thresholdKph: 60 });
  assert.deepEqual(response.recentEvents[1]?.details, { confirmationDistanceMeters: 12, lastDistanceMeters: 350, minimumDistanceMeters: 8, distanceThresholdMeters: 300, durationThresholdMinutes: 60 });
  const json = JSON.stringify(response);
  for (const forbidden of ["externalDeviceId", "valid", "outdated", "vehicleId", "activeKey", "dedupeKey", "lockToken", "attemptCount", "lastError", "telegram", "journal", "notificationOutbox"]) assert.equal(json.includes(forbidden), false, forbidden);
});

test("observable shared projections align with fleet-map and alert-events list behavior", async () => {
  const details = await subject(snapshot({ recentEvents: [speedingEvent({ notificationOutbox: [{ status: AlertNotificationStatus.FAILED }] })] })).getDetails(VEHICLE_ID, testUserId);
  const fleet = await new FleetMapQueryService({ getSnapshot: async () => ({ positionFreshnessSeconds: 300, vehicles: [{ id: VEHICLE_ID, name: "Taxi 7", group: null, currentState: CURRENT }] }) }, { now: () => NOW }, unrestrictedScopes).getSnapshot(testUserId);
  assert.deepEqual(details.currentState, { position: fleet.vehicles[0]?.position, speedKph: fleet.vehicles[0]?.speedKph, freshness: fleet.vehicles[0]?.freshness });
  const alertRow = { lastObservedAt: NOW, ...speedingEvent({ notificationOutbox: [{ status: AlertNotificationStatus.FAILED }] }), vehicle: { id: VEHICLE_ID, name: "Taxi 7", group: null } };
  const events = await new AlertEventsQueryService({ getVehicleOptions: async () => [], getGroupMetadataCarriers: async () => [], list: async () => ({ rows: [alertRow], hasMore: false }), getOpenSummary: async () => ({ speeding: 0, inactivity: 0 }), getOpenMapSnapshot: async () => ({ rows: [], exceededLimit: false }) }, { now: () => NOW }, unrestrictedScopes).list({ status: undefined, type: undefined, vehicleId: VEHICLE_ID, group: { kind: "ALL" }, limit: 10, cursor: undefined }, testUserId);
  const { vehicle: _vehicle, lastObservedAt: _lastObservedAt, ...scoped } = events.items[0]!;
  assert.deepEqual(details.recentEvents[0], scoped);
});
