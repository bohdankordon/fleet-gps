import assert from "node:assert/strict";
import test from "node:test";
import type { FleetMapResponse } from "@/lib/fleet-map/fleet-map-contract";
import type { OpenAlertMapResponse } from "./open-alert-map-contract";
import { alertsForFleetVehicle, fleetAlertMapEventPresentation, fleetAlertMapToGeoJson, joinFleetOpenAlerts } from "./open-alert-map-model";

const idA = "00000000-0000-4000-8000-000000000001";
const idB = "00000000-0000-4000-8000-000000000002";
const idMissing = "00000000-0000-4000-8000-000000000003";
const fleet: FleetMapResponse = {
  generatedAt: "2026-08-10T12:00:00.000Z", positionFreshnessSeconds: 300,
  summary: { totalVehicles: 2, withPosition: 2, withoutPosition: 0, invalidPosition: 0, fresh: 1, stale: 1 },
  vehicles: [
    { vehicle: { id: idA, name: "Alpha", group: null }, position: { latitude: 49, longitude: 28, observedAt: "2026-08-10T11:59:00.000Z" }, speedKph: 20, freshness: "FRESH" },
    { vehicle: { id: idB, name: "Beta", group: null }, position: { latitude: 50, longitude: 29, observedAt: "2026-08-10T11:00:00.000Z" }, speedKph: null, freshness: "STALE" },
  ],
};
const alerts: OpenAlertMapResponse = {
  generatedAt: "2026-08-10T12:00:01.000Z",
  summary: { totalOpenAlerts: 3, vehiclesWithOpenAlerts: 2, speeding: 2, inactivity: 1 },
  vehicles: [
    { vehicle: { id: idA, name: "Alpha", group: null }, alerts: [{ type: "INACTIVITY", openedAt: "2026-08-10T10:01:00.000Z" }, { type: "SPEEDING", openedAt: "2026-08-10T10:00:00.000Z" }] },
    { vehicle: { id: idMissing, name: "Missing", group: null }, alerts: [{ type: "SPEEDING", openedAt: "2026-08-10T09:00:00.000Z" }] },
  ],
};

test("joins no alerts, one type, both types, and an alert vehicle without map position", () => {
  assert.equal(joinFleetOpenAlerts(fleet, null).summary.totalOpenAlerts, 0);
  const model = joinFleetOpenAlerts(fleet, alerts);
  assert.deepEqual(alertsForFleetVehicle(model, idA).map((alert) => alert.type), ["SPEEDING", "INACTIVITY"]);
  assert.deepEqual(alertsForFleetVehicle(model, idB), []);
  assert.deepEqual(model.summary, { totalOpenAlerts: 3, vehiclesWithOpenAlerts: 2, visibleVehiclesWithOpenAlerts: 1, vehiclesWithoutMapPosition: 1, speeding: 2, inactivity: 1 });
});

test("GeoJSON preserves longitude/latitude and carries only render-safe alert flags", () => {
  const geojson = fleetAlertMapToGeoJson(joinFleetOpenAlerts(fleet, alerts));
  assert.equal(geojson.features.length, 2);
  assert.deepEqual(geojson.features[0]?.geometry.coordinates, [28, 49]);
  assert.deepEqual(geojson.features[0]?.properties, { vehicleId: idA, freshness: "FRESH", hasSpeeding: true, hasInactivity: true, eventPresentation: "SPEEDING" });
  assert.deepEqual(geojson.features[1]?.properties, { vehicleId: idB, freshness: "STALE", hasSpeeding: false, hasInactivity: false, eventPresentation: null });
  for (const forbidden of ["openedAt", "vehicleName", "eventId", "activeKey", "coordinatesAtAlert"]) assert.equal(JSON.stringify(geojson).includes(forbidden), false);
});

test("presentation priority is SPEEDING over INACTIVITY while preserving both source flags", () => {
  assert.equal(fleetAlertMapEventPresentation(false, false), null);
  assert.equal(fleetAlertMapEventPresentation(false, true), "INACTIVITY");
  assert.equal(fleetAlertMapEventPresentation(true, false), "SPEEDING");
  assert.equal(fleetAlertMapEventPresentation(true, true), "SPEEDING");
});
