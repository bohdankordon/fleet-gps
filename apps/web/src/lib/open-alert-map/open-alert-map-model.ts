import type { Feature, FeatureCollection, Point } from "geojson";
import type { FleetMapResponse, FleetMapVehicle } from "@/lib/fleet-map/fleet-map-contract";
import type { OpenAlertMapAlert, OpenAlertMapResponse } from "./open-alert-map-contract";

export type FleetAlertMapVehicle = Readonly<{ marker: FleetMapVehicle; alerts: readonly OpenAlertMapAlert[] }>;
export type FleetAlertMapSummary = Readonly<{
  totalOpenAlerts: number;
  vehiclesWithOpenAlerts: number;
  visibleVehiclesWithOpenAlerts: number;
  vehiclesWithoutMapPosition: number;
  speeding: number;
  inactivity: number;
}>;
export type FleetAlertMapModel = Readonly<{ vehicles: readonly FleetAlertMapVehicle[]; summary: FleetAlertMapSummary }>;
export type FleetAlertMapFeatureProperties = Readonly<{ vehicleId: string; freshness: "FRESH" | "STALE"; hasSpeeding: boolean; hasInactivity: boolean }>;
export type FleetAlertMapFeatureCollection = FeatureCollection<Point, FleetAlertMapFeatureProperties>;

const typeOrder = Object.freeze({ SPEEDING: 0, INACTIVITY: 1 } as const);

export function joinFleetOpenAlerts(fleet: FleetMapResponse, alerts: OpenAlertMapResponse | null): FleetAlertMapModel {
  const alertsByVehicle = new Map((alerts?.vehicles ?? []).map((entry) => [entry.vehicle.id, [...entry.alerts].sort((left, right) => typeOrder[left.type] - typeOrder[right.type]) as readonly OpenAlertMapAlert[]]));
  const vehicles = fleet.vehicles.map((marker) => Object.freeze({ marker, alerts: alertsByVehicle.get(marker.vehicle.id) ?? Object.freeze([]) }));
  const visibleVehiclesWithOpenAlerts = vehicles.filter((vehicle) => vehicle.alerts.length > 0).length;
  const base = alerts?.summary ?? { totalOpenAlerts: 0, vehiclesWithOpenAlerts: 0, speeding: 0, inactivity: 0 };
  return Object.freeze({
    vehicles: Object.freeze(vehicles),
    summary: Object.freeze({ ...base, visibleVehiclesWithOpenAlerts, vehiclesWithoutMapPosition: Math.max(0, base.vehiclesWithOpenAlerts - visibleVehiclesWithOpenAlerts) }),
  });
}

export function fleetAlertMapToGeoJson(model: FleetAlertMapModel): FleetAlertMapFeatureCollection {
  return {
    type: "FeatureCollection",
    features: model.vehicles.map(({ marker, alerts }): Feature<Point, FleetAlertMapFeatureProperties> => ({
      type: "Feature",
      id: marker.vehicle.id,
      properties: {
        vehicleId: marker.vehicle.id,
        freshness: marker.freshness,
        hasSpeeding: alerts.some((alert) => alert.type === "SPEEDING"),
        hasInactivity: alerts.some((alert) => alert.type === "INACTIVITY"),
      },
      geometry: { type: "Point", coordinates: [marker.position.longitude, marker.position.latitude] },
    })),
  };
}

export function alertsForFleetVehicle(model: FleetAlertMapModel, vehicleId: string | null): readonly OpenAlertMapAlert[] {
  return vehicleId === null ? [] : model.vehicles.find((entry) => entry.marker.vehicle.id === vehicleId)?.alerts ?? [];
}
