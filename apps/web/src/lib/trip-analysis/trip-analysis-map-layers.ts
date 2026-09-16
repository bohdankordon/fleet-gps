import type { CircleLayerSpecification, GeoJSONSource, LineLayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import { FLEET_MAP_PRESENTATION } from "../fleet-map/fleet-map-presentation";
import type { VehicleTrackPresentationModel } from "../vehicle-track/vehicle-track-presentation";
import type { SpeedingRouteGeoJson } from "./trip-analysis-speeding-route";

export const TRIP_MAP_LINE_SOURCE_ID = "trips-map-lines";
export const TRIP_MAP_POINT_SOURCE_ID = "trips-map-points";
export const TRIP_MAP_LINE_LAYER_ID = "trips-map-line";
export const TRIP_MAP_WARNING_ACCENT_LAYER_ID = "trips-map-points-warning-accent";
export const TRIP_MAP_NORMAL_POINT_LAYER_ID = "trips-map-points-normal";
export const TRIP_MAP_ENDPOINT_LAYER_ID = "trips-map-endpoints";
export const TRIP_EVENT_SOURCE_ID = "trips-speeding-event";
export const TRIP_EVENT_HALO_LAYER_ID = "trips-speeding-event-halo";
export const TRIP_EVENT_MARKER_LAYER_ID = "trips-speeding-event-marker";
export const TRIP_SPEEDING_ROUTE_SOURCE_ID = "trips-speeding-route";
export const TRIP_SPEEDING_ROUTE_LAYER_ID = "trips-speeding-route-line";
export const TRIP_MAP_LAYER_ORDER = Object.freeze([
  TRIP_SPEEDING_ROUTE_LAYER_ID,
  TRIP_MAP_LINE_LAYER_ID,
  TRIP_MAP_WARNING_ACCENT_LAYER_ID,
  TRIP_MAP_NORMAL_POINT_LAYER_ID,
  TRIP_MAP_ENDPOINT_LAYER_ID,
] as const);

export const TRIP_MAP_PRESENTATION = Object.freeze({
  routeColor: "#246c95",
  observationColor: "#176f86",
  warningAccentColor: "#a55a08",
  startColor: FLEET_MAP_PRESENTATION.fresh,
  endColor: FLEET_MAP_PRESENTATION.speeding,
  outlineColor: FLEET_MAP_PRESENTATION.markerOutline,
  baseRadius: FLEET_MAP_PRESENTATION.baseRadius,
  warningRadius: FLEET_MAP_PRESENTATION.speedingRadius,
  eventColor: FLEET_MAP_PRESENTATION.speeding,
  eventRadius: 8,
  eventHaloRadius: 14,
} as const);

export const TRIP_MAP_LEGEND_ITEMS = Object.freeze([
  { kind: "route", messageKey: "trips.legend.route" },
  { kind: "observation", messageKey: "trips.legend.observation" },
  { kind: "warning", messageKey: "trips.legend.qualityWarning" },
  { kind: "start", messageKey: "trips.legend.start" },
  { kind: "end", messageKey: "trips.legend.end" },
  { kind: "stop", messageKey: "trips.legend.stop" },
] as const);

export function tripMapLayers(): readonly [LineLayerSpecification, ...CircleLayerSpecification[]] {
  return [
    {
      id: TRIP_MAP_LINE_LAYER_ID,
      type: "line",
      source: TRIP_MAP_LINE_SOURCE_ID,
      paint: {
        "line-color": TRIP_MAP_PRESENTATION.routeColor,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 15, 4],
        "line-opacity": 0.82,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    },
    {
      id: TRIP_MAP_WARNING_ACCENT_LAYER_ID,
      type: "circle",
      source: TRIP_MAP_POINT_SOURCE_ID,
      filter: ["==", ["get", "qualityWarning"], true],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 7, 15, TRIP_MAP_PRESENTATION.warningRadius],
        "circle-color": "transparent",
        "circle-stroke-width": 2.5,
        "circle-stroke-color": TRIP_MAP_PRESENTATION.warningAccentColor,
        "circle-stroke-opacity": 0.9,
      },
    },
    {
      id: TRIP_MAP_NORMAL_POINT_LAYER_ID,
      type: "circle",
      source: TRIP_MAP_POINT_SOURCE_ID,
      filter: ["==", ["get", "endpoint"], "none"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 15, TRIP_MAP_PRESENTATION.baseRadius],
        "circle-color": TRIP_MAP_PRESENTATION.observationColor,
        "circle-opacity": 1,
        "circle-stroke-width": 2,
        "circle-stroke-color": TRIP_MAP_PRESENTATION.outlineColor,
      },
    },
    {
      id: TRIP_MAP_ENDPOINT_LAYER_ID,
      type: "circle",
      source: TRIP_MAP_POINT_SOURCE_ID,
      filter: ["!=", ["get", "endpoint"], "none"],
      paint: {
        "circle-radius": ["match", ["get", "endpoint"], "start", 7, "end", 7, "single", 7, TRIP_MAP_PRESENTATION.baseRadius],
        "circle-color": ["match", ["get", "endpoint"], "start", TRIP_MAP_PRESENTATION.startColor, "end", TRIP_MAP_PRESENTATION.endColor, TRIP_MAP_PRESENTATION.observationColor],
        "circle-stroke-width": 2,
        "circle-stroke-color": TRIP_MAP_PRESENTATION.outlineColor,
      },
    },
  ];
}

export function ensureTripMapLayers(map: MapLibreMap, model: VehicleTrackPresentationModel): void {
  if (!map.getSource(TRIP_MAP_LINE_SOURCE_ID)) map.addSource(TRIP_MAP_LINE_SOURCE_ID, { type: "geojson", data: model.lineGeoJson });
  if (!map.getSource(TRIP_MAP_POINT_SOURCE_ID)) map.addSource(TRIP_MAP_POINT_SOURCE_ID, { type: "geojson", data: model.pointGeoJson });
  const firstSymbolLayerId = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
  for (const layer of tripMapLayers()) if (!map.getLayer(layer.id)) map.addLayer(layer, firstSymbolLayerId);
}

export function updateTripMapData(map: MapLibreMap, model: VehicleTrackPresentationModel): void {
  (map.getSource(TRIP_MAP_LINE_SOURCE_ID) as GeoJSONSource | undefined)?.setData(model.lineGeoJson);
  (map.getSource(TRIP_MAP_POINT_SOURCE_ID) as GeoJSONSource | undefined)?.setData(model.pointGeoJson);
}

const EMPTY_SPEEDING_ROUTE: SpeedingRouteGeoJson = { type: "FeatureCollection", features: [] };

export function tripSpeedingRouteLayer(): LineLayerSpecification {
  return {
    id: TRIP_SPEEDING_ROUTE_LAYER_ID,
    type: "line",
    source: TRIP_SPEEDING_ROUTE_SOURCE_ID,
    paint: {
      "line-color": TRIP_MAP_PRESENTATION.eventColor,
      "line-width": ["interpolate", ["linear"], ["zoom"], 9, 6, 15, 10],
      "line-opacity": 0.47,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  };
}

export function ensureTripSpeedingRouteLayer(map: MapLibreMap, data: SpeedingRouteGeoJson = EMPTY_SPEEDING_ROUTE): void {
  if (!map.getSource(TRIP_SPEEDING_ROUTE_SOURCE_ID)) map.addSource(TRIP_SPEEDING_ROUTE_SOURCE_ID, { type: "geojson", data });
  if (!map.getLayer(TRIP_SPEEDING_ROUTE_LAYER_ID)) map.addLayer(
    tripSpeedingRouteLayer(),
    map.getLayer(TRIP_MAP_LINE_LAYER_ID) ? TRIP_MAP_LINE_LAYER_ID : map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id,
  );
}

export function updateTripSpeedingRouteData(map: MapLibreMap, data: SpeedingRouteGeoJson): void {
  (map.getSource(TRIP_SPEEDING_ROUTE_SOURCE_ID) as GeoJSONSource | undefined)?.setData(data);
}

export type TripEventPosition = Readonly<{ latitude: number; longitude: number }> | null;

export function tripEventGeoJson(position: TripEventPosition): FeatureCollection<Point, Readonly<{ kind: "SPEEDING_CONFIRMATION" }>> {
  return { type: "FeatureCollection", features: position === null ? [] : [{ type: "Feature", properties: { kind: "SPEEDING_CONFIRMATION" }, geometry: { type: "Point", coordinates: [position.longitude, position.latitude] } }] };
}

export function tripEventLayers(): readonly CircleLayerSpecification[] {
  return [
    { id: TRIP_EVENT_HALO_LAYER_ID, type: "circle", source: TRIP_EVENT_SOURCE_ID, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 10, 16, TRIP_MAP_PRESENTATION.eventHaloRadius], "circle-color": TRIP_MAP_PRESENTATION.eventColor, "circle-opacity": 0.18, "circle-stroke-width": 2, "circle-stroke-color": TRIP_MAP_PRESENTATION.eventColor, "circle-stroke-opacity": 0.45 } },
    { id: TRIP_EVENT_MARKER_LAYER_ID, type: "circle", source: TRIP_EVENT_SOURCE_ID, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 6, 16, TRIP_MAP_PRESENTATION.eventRadius], "circle-color": TRIP_MAP_PRESENTATION.eventColor, "circle-opacity": 1, "circle-stroke-width": 2, "circle-stroke-color": TRIP_MAP_PRESENTATION.outlineColor } },
  ];
}

export function ensureTripEventLayer(map: MapLibreMap, position: TripEventPosition): void {
  if (!map.getSource(TRIP_EVENT_SOURCE_ID)) map.addSource(TRIP_EVENT_SOURCE_ID, { type: "geojson", data: tripEventGeoJson(position) });
  const firstSymbolLayerId = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
  for (const layer of tripEventLayers()) if (!map.getLayer(layer.id)) map.addLayer(layer, firstSymbolLayerId);
}

export function updateTripEventData(map: MapLibreMap, position: TripEventPosition): void {
  (map.getSource(TRIP_EVENT_SOURCE_ID) as GeoJSONSource | undefined)?.setData(tripEventGeoJson(position));
}
