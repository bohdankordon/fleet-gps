import type { CircleLayerSpecification, GeoJSONSource, LineLayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import { FLEET_MAP_PRESENTATION } from "../fleet-map/fleet-map-presentation";
import type { VehicleTrackPresentationModel } from "./vehicle-track-presentation";

export const VEHICLE_TRACK_LINE_SOURCE_ID = "vehicle-track-lines";
export const VEHICLE_TRACK_POINT_SOURCE_ID = "vehicle-track-points";
export const VEHICLE_TRACK_LINE_LAYER_ID = "vehicle-track-line";
export const VEHICLE_TRACK_WARNING_ACCENT_LAYER_ID = "vehicle-track-points-warning-accent";
export const VEHICLE_TRACK_NORMAL_POINT_LAYER_ID = "vehicle-track-points-normal";
export const VEHICLE_TRACK_ENDPOINT_LAYER_ID = "vehicle-track-endpoints";
export const VEHICLE_TRACK_SELECTED_LAYER_ID = "vehicle-track-selected";
export const VEHICLE_TRACK_LAYER_ORDER = Object.freeze([VEHICLE_TRACK_LINE_LAYER_ID, VEHICLE_TRACK_WARNING_ACCENT_LAYER_ID, VEHICLE_TRACK_NORMAL_POINT_LAYER_ID, VEHICLE_TRACK_ENDPOINT_LAYER_ID, VEHICLE_TRACK_SELECTED_LAYER_ID] as const);
export const VEHICLE_TRACK_PRESENTATION = Object.freeze({
  route: "#246c95",
  observation: "#176f86",
  warning: "#a55a08",
  start: FLEET_MAP_PRESENTATION.fresh,
  end: FLEET_MAP_PRESENTATION.speeding,
  selected: FLEET_MAP_PRESENTATION.selected,
  outline: FLEET_MAP_PRESENTATION.markerOutline,
} as const);

export function vehicleTrackLayers(selectedKey: string | null): readonly [LineLayerSpecification, ...CircleLayerSpecification[]] {
  return [
    { id: VEHICLE_TRACK_LINE_LAYER_ID, type: "line", source: VEHICLE_TRACK_LINE_SOURCE_ID, paint: { "line-color": VEHICLE_TRACK_PRESENTATION.route, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 15, 4], "line-opacity": 0.82 }, layout: { "line-cap": "round", "line-join": "round" } },
    { id: VEHICLE_TRACK_WARNING_ACCENT_LAYER_ID, type: "circle", source: VEHICLE_TRACK_POINT_SOURCE_ID, filter: ["==", ["get", "qualityWarning"], true], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 7, 15, FLEET_MAP_PRESENTATION.speedingRadius], "circle-color": "transparent", "circle-stroke-width": 2.5, "circle-stroke-color": VEHICLE_TRACK_PRESENTATION.warning, "circle-stroke-opacity": 0.9 } },
    { id: VEHICLE_TRACK_NORMAL_POINT_LAYER_ID, type: "circle", source: VEHICLE_TRACK_POINT_SOURCE_ID, filter: ["==", ["get", "endpoint"], "none"], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 15, FLEET_MAP_PRESENTATION.baseRadius], "circle-color": VEHICLE_TRACK_PRESENTATION.observation, "circle-opacity": 1, "circle-stroke-width": 2, "circle-stroke-color": VEHICLE_TRACK_PRESENTATION.outline } },
    { id: VEHICLE_TRACK_ENDPOINT_LAYER_ID, type: "circle", source: VEHICLE_TRACK_POINT_SOURCE_ID, filter: ["!=", ["get", "endpoint"], "none"], paint: { "circle-radius": 7, "circle-color": ["match", ["get", "endpoint"], "start", VEHICLE_TRACK_PRESENTATION.start, "end", VEHICLE_TRACK_PRESENTATION.end, VEHICLE_TRACK_PRESENTATION.observation], "circle-stroke-width": 2, "circle-stroke-color": VEHICLE_TRACK_PRESENTATION.outline } },
    { id: VEHICLE_TRACK_SELECTED_LAYER_ID, type: "circle", source: VEHICLE_TRACK_POINT_SOURCE_ID, filter: ["==", ["get", "key"], selectedKey ?? "__none__"], paint: { "circle-radius": FLEET_MAP_PRESENTATION.selectedRadius, "circle-color": "transparent", "circle-stroke-width": 2.5, "circle-stroke-color": VEHICLE_TRACK_PRESENTATION.selected } },
  ];
}

export function ensureVehicleTrackLayers(map: MapLibreMap, model: VehicleTrackPresentationModel, selectedKey: string | null): void {
  if (!map.getSource(VEHICLE_TRACK_LINE_SOURCE_ID)) map.addSource(VEHICLE_TRACK_LINE_SOURCE_ID, { type: "geojson", data: model.lineGeoJson });
  if (!map.getSource(VEHICLE_TRACK_POINT_SOURCE_ID)) map.addSource(VEHICLE_TRACK_POINT_SOURCE_ID, { type: "geojson", data: model.pointGeoJson });
  const firstSymbolLayerId = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
  for (const layer of vehicleTrackLayers(selectedKey)) if (!map.getLayer(layer.id)) map.addLayer(layer, firstSymbolLayerId);
}

export function updateVehicleTrackMapData(map: MapLibreMap, model: VehicleTrackPresentationModel, selectedKey: string | null): void {
  (map.getSource(VEHICLE_TRACK_LINE_SOURCE_ID) as GeoJSONSource | undefined)?.setData(model.lineGeoJson);
  (map.getSource(VEHICLE_TRACK_POINT_SOURCE_ID) as GeoJSONSource | undefined)?.setData(model.pointGeoJson);
  if (map.getLayer(VEHICLE_TRACK_SELECTED_LAYER_ID)) map.setFilter(VEHICLE_TRACK_SELECTED_LAYER_ID, ["==", ["get", "key"], selectedKey ?? "__none__"]);
}
