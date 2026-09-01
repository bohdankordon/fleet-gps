import type { CircleLayerSpecification, ExpressionSpecification, Map as MapLibreMap, SymbolLayerSpecification } from "maplibre-gl";
import { FLEET_MAP_INACTIVITY_IMAGE_ID, FLEET_MAP_PRESENTATION, type FleetMapInactivityRingImage } from "../fleet-map/fleet-map-presentation";
import type { FleetAlertMapFeatureCollection } from "./open-alert-map-model";

export const FLEET_MAP_SOURCE_ID = "fleet-vehicles";
export const FLEET_MAP_PROMOTED_ID_PROPERTY = "vehicleId";
export const FLEET_MAP_VEHICLE_LAYER_ID = "fleet-vehicles";
export const OPEN_ALERT_SPEEDING_LAYER_ID = "fleet-alert-speeding";
export const OPEN_ALERT_INACTIVITY_LAYER_ID = "fleet-alert-inactivity";
export const FLEET_MAP_SELECTED_LAYER_ID = "fleet-vehicles-selected";
export const FLEET_MAP_HIT_LAYER_ID = "fleet-vehicles-hit-area";
export const FLEET_MAP_OVERLAY_LAYER_ORDER = Object.freeze([
  FLEET_MAP_VEHICLE_LAYER_ID,
  OPEN_ALERT_SPEEDING_LAYER_ID,
  OPEN_ALERT_INACTIVITY_LAYER_ID,
  FLEET_MAP_SELECTED_LAYER_ID,
  FLEET_MAP_HIT_LAYER_ID,
] as const);

function hoverValue(normal: number): ExpressionSpecification {
  return ["case", ["boolean", ["feature-state", "hover"], false], normal * FLEET_MAP_PRESENTATION.hoverScale, normal];
}

export function fleetAlertMapLayers(selectedId: string | null): readonly (CircleLayerSpecification | SymbolLayerSpecification)[] {
  return [
    { id: FLEET_MAP_VEHICLE_LAYER_ID, type: "circle", source: FLEET_MAP_SOURCE_ID, paint: { "circle-radius": hoverValue(FLEET_MAP_PRESENTATION.baseRadius), "circle-color": ["match", ["get", "freshness"], "FRESH", FLEET_MAP_PRESENTATION.fresh, FLEET_MAP_PRESENTATION.stale], "circle-opacity": 1, "circle-stroke-width": hoverValue(2), "circle-stroke-color": FLEET_MAP_PRESENTATION.markerOutline } },
    { id: OPEN_ALERT_SPEEDING_LAYER_ID, type: "circle", source: FLEET_MAP_SOURCE_ID, filter: ["==", ["get", "eventPresentation"], "SPEEDING"], paint: { "circle-radius": hoverValue(FLEET_MAP_PRESENTATION.speedingRadius), "circle-color": FLEET_MAP_PRESENTATION.markerOutline, "circle-opacity": 0, "circle-stroke-width": hoverValue(2.5), "circle-stroke-color": FLEET_MAP_PRESENTATION.speeding, "circle-stroke-opacity": 1 } },
    { id: OPEN_ALERT_INACTIVITY_LAYER_ID, type: "symbol", source: FLEET_MAP_SOURCE_ID, filter: ["==", ["get", "eventPresentation"], "INACTIVITY"], layout: { "icon-image": FLEET_MAP_INACTIVITY_IMAGE_ID, "icon-allow-overlap": true, "icon-ignore-placement": true } },
    { id: FLEET_MAP_SELECTED_LAYER_ID, type: "circle", source: FLEET_MAP_SOURCE_ID, filter: ["==", ["get", "vehicleId"], selectedId ?? "__none__"], paint: { "circle-radius": hoverValue(FLEET_MAP_PRESENTATION.selectedRadius), "circle-color": FLEET_MAP_PRESENTATION.selected, "circle-opacity": 0, "circle-stroke-width": 2.5, "circle-stroke-color": FLEET_MAP_PRESENTATION.selected, "circle-stroke-opacity": 1 } },
    { id: FLEET_MAP_HIT_LAYER_ID, type: "circle", source: FLEET_MAP_SOURCE_ID, paint: { "circle-radius": FLEET_MAP_PRESENTATION.hitRadius, "circle-color": FLEET_MAP_PRESENTATION.markerOutline, "circle-opacity": 0, "circle-stroke-width": 0 } },
  ];
}

export function ensureFleetAlertMapLayers(map: MapLibreMap, data: FleetAlertMapFeatureCollection, selectedId: string | null, inactivityRing: FleetMapInactivityRingImage): void {
  if (!map.getSource(FLEET_MAP_SOURCE_ID)) map.addSource(FLEET_MAP_SOURCE_ID, { type: "geojson", data, promoteId: FLEET_MAP_PROMOTED_ID_PROPERTY });
  if (!map.hasImage(FLEET_MAP_INACTIVITY_IMAGE_ID)) map.addImage(FLEET_MAP_INACTIVITY_IMAGE_ID, inactivityRing.image, { pixelRatio: inactivityRing.pixelRatio });
  for (const layer of fleetAlertMapLayers(selectedId)) if (!map.getLayer(layer.id)) map.addLayer(layer);
}
