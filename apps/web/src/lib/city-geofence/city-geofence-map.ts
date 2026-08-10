import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { FillLayerSpecification, LineLayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import type { CityGeofenceMapResponse } from "./city-geofence-contract";

export const CITY_GEOFENCE_SOURCE_ID = "city-geofence";
export const CITY_GEOFENCE_FILL_LAYER_ID = "city-geofence-fill";
export const CITY_GEOFENCE_OUTLINE_LAYER_ID = "city-geofence-outline";

export type CityGeofenceFeatureCollection = FeatureCollection<Polygon, Record<string, never>>;
export type CityGeofenceBounds = readonly [readonly [number, number], readonly [number, number]];

export function cityGeofenceToGeoJson(snapshot: CityGeofenceMapResponse | null): CityGeofenceFeatureCollection {
  if (!snapshot?.configured || snapshot.geometry === null) return { type: "FeatureCollection", features: [] };
  const feature: Feature<Polygon, Record<string, never>> = {
    type: "Feature",
    properties: {},
    geometry: snapshot.geometry,
  };
  return { type: "FeatureCollection", features: [feature] };
}

export function cityGeofenceBounds(snapshot: CityGeofenceMapResponse | null): CityGeofenceBounds | null {
  const positions = snapshot?.geometry?.coordinates.flat() ?? [];
  if (positions.length === 0) return null;
  const longitudes = positions.map(([longitude]) => longitude);
  const latitudes = positions.map(([, latitude]) => latitude);
  return [[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]];
}

export function cityGeofenceLayers(): readonly [FillLayerSpecification, LineLayerSpecification] {
  return [
    {
      id: CITY_GEOFENCE_FILL_LAYER_ID,
      type: "fill",
      source: CITY_GEOFENCE_SOURCE_ID,
      paint: { "fill-color": "#2b7794", "fill-opacity": 0.08 },
    },
    {
      id: CITY_GEOFENCE_OUTLINE_LAYER_ID,
      type: "line",
      source: CITY_GEOFENCE_SOURCE_ID,
      paint: { "line-color": "#1d6684", "line-opacity": 0.9, "line-width": 2 },
    },
  ];
}

export function ensureCityGeofenceLayers(map: MapLibreMap, snapshot: CityGeofenceMapResponse | null): void {
  if (!map.getSource(CITY_GEOFENCE_SOURCE_ID)) {
    map.addSource(CITY_GEOFENCE_SOURCE_ID, { type: "geojson", data: cityGeofenceToGeoJson(snapshot) });
  }
  const firstSymbolLayerId = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
  for (const layer of cityGeofenceLayers()) {
    if (!map.getLayer(layer.id)) map.addLayer(layer, firstSymbolLayerId);
  }
}
