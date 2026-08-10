import type { CircleLayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import type { FleetAlertMapFeatureCollection } from "./open-alert-map-model";

export const FLEET_MAP_SOURCE_ID = "fleet-vehicles";
export const FLEET_MAP_VEHICLE_LAYER_ID = "fleet-vehicles";
export const OPEN_ALERT_SPEEDING_LAYER_ID = "fleet-alert-speeding";
export const OPEN_ALERT_INACTIVITY_LAYER_ID = "fleet-alert-inactivity";
export const FLEET_MAP_SELECTED_LAYER_ID = "fleet-vehicles-selected";
export const FLEET_MAP_OVERLAY_LAYER_ORDER = Object.freeze([
  FLEET_MAP_VEHICLE_LAYER_ID,
  OPEN_ALERT_SPEEDING_LAYER_ID,
  OPEN_ALERT_INACTIVITY_LAYER_ID,
  FLEET_MAP_SELECTED_LAYER_ID,
] as const);

export function fleetAlertMapLayers(selectedId: string | null): readonly CircleLayerSpecification[] {
  return [
    { id: FLEET_MAP_VEHICLE_LAYER_ID, type: "circle", source: FLEET_MAP_SOURCE_ID, paint: { "circle-radius": 7, "circle-color": ["match", ["get", "freshness"], "FRESH", "#17734d", "#9a6110"], "circle-opacity": ["match", ["get", "freshness"], "FRESH", 0.95, 0.72], "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" } },
    { id: OPEN_ALERT_SPEEDING_LAYER_ID, type: "circle", source: FLEET_MAP_SOURCE_ID, filter: ["==", ["get", "hasSpeeding"], true], paint: { "circle-radius": 11, "circle-color": "#ffffff", "circle-opacity": 0, "circle-stroke-width": 3, "circle-stroke-color": "#c43d32", "circle-stroke-opacity": 0.95 } },
    { id: OPEN_ALERT_INACTIVITY_LAYER_ID, type: "circle", source: FLEET_MAP_SOURCE_ID, filter: ["==", ["get", "hasInactivity"], true], paint: { "circle-radius": 14, "circle-color": "#ffffff", "circle-opacity": 0, "circle-stroke-width": 2.5, "circle-stroke-color": "#6e4aa1", "circle-stroke-opacity": 0.9 } },
    { id: FLEET_MAP_SELECTED_LAYER_ID, type: "circle", source: FLEET_MAP_SOURCE_ID, filter: ["==", ["get", "vehicleId"], selectedId ?? "__none__"], paint: { "circle-radius": 17, "circle-color": "#1d5f87", "circle-opacity": 0.12, "circle-stroke-width": 3, "circle-stroke-color": "#1d5f87" } },
  ];
}

export function ensureFleetAlertMapLayers(map: MapLibreMap, data: FleetAlertMapFeatureCollection, selectedId: string | null): void {
  if (!map.getSource(FLEET_MAP_SOURCE_ID)) map.addSource(FLEET_MAP_SOURCE_ID, { type: "geojson", data });
  for (const layer of fleetAlertMapLayers(selectedId)) if (!map.getLayer(layer.id)) map.addLayer(layer);
}
