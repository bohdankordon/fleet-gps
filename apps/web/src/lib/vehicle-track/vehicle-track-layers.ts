import type { CircleLayerSpecification, GeoJSONSource, LineLayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import type { VehicleTrackPresentationModel } from "./vehicle-track-presentation";

export const VEHICLE_TRACK_LINE_SOURCE_ID = "vehicle-track-lines";
export const VEHICLE_TRACK_POINT_SOURCE_ID = "vehicle-track-points";
export const VEHICLE_TRACK_LINE_LAYER_ID = "vehicle-track-line";
export const VEHICLE_TRACK_NORMAL_POINT_LAYER_ID = "vehicle-track-points-normal";
export const VEHICLE_TRACK_WARNING_POINT_LAYER_ID = "vehicle-track-points-warning";
export const VEHICLE_TRACK_ENDPOINT_LAYER_ID = "vehicle-track-endpoints";
export const VEHICLE_TRACK_SELECTED_LAYER_ID = "vehicle-track-selected";
export const VEHICLE_TRACK_LAYER_ORDER = Object.freeze([VEHICLE_TRACK_LINE_LAYER_ID, VEHICLE_TRACK_NORMAL_POINT_LAYER_ID, VEHICLE_TRACK_WARNING_POINT_LAYER_ID, VEHICLE_TRACK_ENDPOINT_LAYER_ID, VEHICLE_TRACK_SELECTED_LAYER_ID] as const);

export function vehicleTrackLayers(selectedKey: string | null): readonly [LineLayerSpecification, ...CircleLayerSpecification[]] {
  return [
    { id: VEHICLE_TRACK_LINE_LAYER_ID, type: "line", source: VEHICLE_TRACK_LINE_SOURCE_ID, paint: { "line-color": "#246c95", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 15, 4], "line-opacity": 0.82 } },
    { id: VEHICLE_TRACK_NORMAL_POINT_LAYER_ID, type: "circle", source: VEHICLE_TRACK_POINT_SOURCE_ID, filter: ["==", ["get", "qualityWarning"], false], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2, 15, 4.5], "circle-color": "#176f86", "circle-opacity": 0.72, "circle-stroke-width": 0.8, "circle-stroke-color": "#ffffff" } },
    { id: VEHICLE_TRACK_WARNING_POINT_LAYER_ID, type: "circle", source: VEHICLE_TRACK_POINT_SOURCE_ID, filter: ["==", ["get", "qualityWarning"], true], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2, 15, 4.5], "circle-color": "#ffffff", "circle-opacity": 0.95, "circle-stroke-width": 2, "circle-stroke-color": "#a55a08" } },
    { id: VEHICLE_TRACK_ENDPOINT_LAYER_ID, type: "circle", source: VEHICLE_TRACK_POINT_SOURCE_ID, filter: ["!=", ["get", "endpoint"], "none"], paint: { "circle-radius": ["match", ["get", "endpoint"], "start", 7, "end", 9, 8], "circle-color": ["match", ["get", "endpoint"], "start", "#17734d", "end", "#a63d38", "#6e4aa1"], "circle-stroke-width": ["match", ["get", "endpoint"], "end", 3.5, 2.5], "circle-stroke-color": "#ffffff" } },
    { id: VEHICLE_TRACK_SELECTED_LAYER_ID, type: "circle", source: VEHICLE_TRACK_POINT_SOURCE_ID, filter: ["==", ["get", "key"], selectedKey ?? "__none__"], paint: { "circle-radius": 12, "circle-color": "#ffffff", "circle-opacity": 0.18, "circle-stroke-width": 3, "circle-stroke-color": "#17212b" } },
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
