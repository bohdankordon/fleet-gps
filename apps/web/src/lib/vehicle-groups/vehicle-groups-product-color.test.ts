import assert from "node:assert/strict";
import test from "node:test";
 import { parseDashboardVehiclesResponse } from "../dashboard/dashboard-contract";
 import { parseFleetMapResponse } from "../fleet-map/fleet-map-contract";
 import { parseAlertEventsListResponse, parseAlertEventsVehicleOptions } from "../alert-events/alert-events-contract";
 import { parseVehicleDetailsResponse } from "../vehicle-details/vehicle-details-contract";
 import { parseVehicleTrackResponse } from "../vehicle-track/vehicle-track-contract";
 import { parseVehicleTrackOverviewResponse } from "../vehicle-track/vehicle-track-overview-contract";
 import { parseFleetActivityReport } from "../fleet-activity-report/fleet-activity-report-contract";
 import { parseOpenAlertMapResponse } from "../open-alert-map/open-alert-map-contract";
 import { parsePreferenceBaseline } from "../account/account-notification-preferences";

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const group = (color: string) => ({ id: GROUP_ID, name: "Taxi", color });

test("product projections carry authorized group color and reject red", () => {
  const dashboard = { serviceDate: "2026-08-05", timezone: "Europe/Kyiv", minimumDailyDistanceMeters: 500, positionFreshnessSeconds: 300, summary: { total: 1, online: 1, offline: 0, unknown: 0, freshPositions: 1, stalePositions: 0, withoutPosition: 0, belowMinimumDistance: 0, withoutDailyStat: 0 }, groups: [], hasUngrouped: false, vehicles: [{ id: "local-id", name: "Vehicle", disabled: false, group: group("GREEN"), status: "online", externalLastUpdateAt: null, fixTime: "2026-08-05T12:00:00.000Z", speedKph: 20, positionValid: true, positionOutdated: false, positionFreshness: "fresh", dailyDistanceMeters: 1000, dailyDistanceSource: "runs", dailyDistanceQuality: "provisional", dailyDistanceStale: false, dailyDistanceDegraded: false, belowMinimumDistance: false }], generatedAt: "2026-08-05T12:01:00.000Z" };
  assert.equal(parseDashboardVehiclesResponse(dashboard).vehicles[0]!.group!.color, "GREEN");
  assert.throws(() => parseDashboardVehiclesResponse({ ...dashboard, vehicles: [{ ...(dashboard.vehicles[0] as object), group: group("RED") }] } as unknown));
  assert.equal(parseDashboardVehiclesResponse({ ...dashboard, vehicles: [{ ...(dashboard.vehicles[0] as object), group: null }] }).vehicles[0]!.group, null);
});

test("fleet map, alert events, and open alert map keep color without leaking", () => {
  const marker = { vehicle: { id: "00000000-0000-4000-8000-000000000001", name: "Taxi", group: group("PURPLE") }, position: { latitude: 49, longitude: 28, observedAt: "2026-08-10T12:00:00.000Z" }, speedKph: null, freshness: "FRESH" as const };
  const fleet = { generatedAt: "2026-08-10T12:01:00.000Z", positionFreshnessSeconds: 300, summary: { totalVehicles: 1, withPosition: 1, withoutPosition: 0, invalidPosition: 0, fresh: 1, stale: 0 }, vehicles: [marker] };
  assert.equal(parseFleetMapResponse(fleet).vehicles[0]!.vehicle.group!.color, "PURPLE");
  assert.throws(() => parseFleetMapResponse({ ...fleet, vehicles: [{ ...marker, vehicle: { ...marker.vehicle, group: group("RED") } }] } as unknown));
  const alert = { id: "00000000-0000-4000-8000-000000000001", vehicle: { id: "00000000-0000-4000-8000-000000000002", name: "Taxi", group: group("CYAN") }, type: "SPEEDING" as const, status: "OPEN" as const, openedAt: "2026-08-08T12:00:00.000Z", lastObservedAt: "2026-08-08T12:05:00.000Z", resolvedAt: null, notificationDeliveryStatus: "PENDING" as const, details: { zone: "CITY" as const, confirmationSpeedKph: 72, lastSpeedKph: 74, peakSpeedKph: 81, thresholdKph: 60 } };
  assert.equal(parseAlertEventsListResponse({ items: [alert], nextCursor: null }).items[0]!.vehicle.group!.color, "CYAN");
  assert.throws(() => parseAlertEventsListResponse({ items: [{ ...alert, vehicle: { ...alert.vehicle, group: group("RED") } }], nextCursor: null } as unknown));
  assert.deepEqual(parseAlertEventsVehicleOptions([{ vehicleId: "00000000-0000-4000-8000-000000000002", vehicleName: "Taxi", group: group("GOLD") }])[0]!.group!.color, "GOLD");
  const openMap = { generatedAt: "2026-08-10T12:01:00.000Z", summary: { totalOpenAlerts: 1, vehiclesWithOpenAlerts: 1, speeding: 1, inactivity: 0 }, vehicles: [{ vehicle: { id: "00000000-0000-4000-8000-000000000002", name: "Taxi", group: group("ORANGE") }, alerts: [{ type: "SPEEDING" as const, openedAt: "2026-08-10T12:00:00.000Z" }] }] };
  assert.equal(parseOpenAlertMapResponse(openMap).vehicles[0]!.vehicle.group!.color, "ORANGE");
});

test("vehicle detail, trips history, and reports keep color with neutral ungrouped", () => {
  const details = { generatedAt: "2026-08-10T12:00:00.000Z", vehicle: { id: "00000000-0000-4000-8000-000000000001", name: "Taxi", disabled: false, group: group("MAGENTA") }, connectivity: "ONLINE" as const, currentState: null, today: null, activeAlerts: [], recentEvents: [] };
  assert.equal(parseVehicleDetailsResponse(details).vehicle.group!.color, "MAGENTA");
  assert.equal(parseVehicleDetailsResponse({ ...details, vehicle: { ...details.vehicle, group: null } }).vehicle.group, null);
  assert.throws(() => parseVehicleDetailsResponse({ ...details, vehicle: { ...details.vehicle, group: group("RED") } } as unknown));
  const track = { generatedAt: "2026-08-10T12:00:00.000Z", vehicle: { id: "00000000-0000-4000-8000-000000000001", name: "Taxi", group: group("GRAY") }, range: { from: "2026-08-10T09:00:00.000Z", to: "2026-08-10T12:00:00.000Z" }, summary: { pointCount: 0, firstObservedAt: null, lastObservedAt: null }, points: [] };
  assert.equal(parseVehicleTrackResponse(track).vehicle.group!.color, "GRAY");
  const reportRow = { vehicleId: "00000000-0000-4000-8000-000000000001", vehicleName: "Taxi", group: group("BLUE"), hasGpsData: false, rawObservationCount: 0, firstObservationAt: null, lastObservationAt: null, tripCount: 0, observedDistanceMeters: 0, tripDurationSeconds: 0, stopCount: 0, stopDurationSeconds: 0, gapCount: 0, gapDurationSeconds: 0 };
  const report = { from: "2026-08-10T00:00:00.000Z", to: "2026-08-10T01:00:00.000Z", generatedAt: "2026-08-10T01:00:00.000Z", timezone: "Europe/Kyiv", policy: { tripMovementSpeedKph: 5, tripMovementConfirmationSeconds: 60, tripStopConfirmationSeconds: 60, tripDataGapSeconds: 60 }, summary: { vehicleCount: 1, vehiclesWithGps: 0, vehicleWithoutGpsCount: 1, tripCount: 0, totalObservedDistanceMeters: 0, totalTripDurationSeconds: 0, gapCount: 0, totalGapDurationSeconds: 0 }, vehicles: [reportRow] };
  assert.equal(parseFleetActivityReport(report).vehicles[0]!.group!.color, "BLUE");
});

test("notification preferences carry group color only for authorized vehicles", () => {
  const base = { enabled: true, speedingEnabled: true, inactivityEnabled: false, vehicleScope: "SELECTED" as const, selectedVehicleIds: [] as string[], revision: 1, canSelectVehicles: true, hasDormantSelections: false, vehicles: [{ id: "11111111-1111-1111-8111-111111111111", name: "Car", disabled: false, groupId: GROUP_ID, groupName: "Taxi", groupColor: "GREEN" as const }] };
  assert.equal(parsePreferenceBaseline(base)!.vehicles[0]!.groupColor, "GREEN");
  assert.equal(parsePreferenceBaseline({ ...base, vehicles: [{ ...base.vehicles[0]!, groupId: null, groupName: null, groupColor: null }] })!.vehicles[0]!.groupColor, null);
  assert.equal(parsePreferenceBaseline({ ...base, vehicles: [{ ...base.vehicles[0]!, groupColor: "RED" }] }), null);
});
