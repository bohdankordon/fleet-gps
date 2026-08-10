import assert from "node:assert/strict";
import test from "node:test";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  CITY_GEOFENCE_FILL_LAYER_ID,
  CITY_GEOFENCE_OUTLINE_LAYER_ID,
  CITY_GEOFENCE_SOURCE_ID,
  cityGeofenceBounds,
  cityGeofenceToGeoJson,
  ensureCityGeofenceLayers,
} from "./city-geofence-map";
import type { CityGeofenceMapResponse } from "./city-geofence-contract";

const configured: CityGeofenceMapResponse = {
  generatedAt: "2026-08-10T12:00:00.000Z",
  configured: true,
  geometry: { type: "Polygon", coordinates: [[[28, 49], [29, 49], [29, 50], [28, 49]]] },
};

test("projects the canonical Polygon without reversing coordinates or leaking metadata", () => {
  const result = cityGeofenceToGeoJson(configured);
  assert.equal(result.features.length, 1);
  assert.deepEqual(result.features[0]?.geometry.coordinates[0]?.[0], [28, 49]);
  assert.deepEqual(result.features[0]?.properties, {});
  assert.deepEqual(Object.keys(result.features[0] ?? {}).sort(), ["geometry", "properties", "type"]);
});

test("unconfigured state produces no polygon layer data", () => {
  assert.deepEqual(cityGeofenceToGeoJson({ ...configured, configured: false, geometry: null }).features, []);
  assert.equal(cityGeofenceBounds({ ...configured, configured: false, geometry: null }), null);
});

test("calculates bounds in longitude/latitude order", () => {
  assert.deepEqual(cityGeofenceBounds(configured), [[28, 49], [29, 50]]);
});

test("installs one source and geofence layers once below symbols and therefore below later vehicle layers", () => {
  const sourceIds = new Set<string>();
  const layerIds = new Set<string>();
  const addedLayers: Array<{ id: string; before?: string }> = [];
  let fleetSetDataCalls = 0;
  const fakeMap = {
    getSource: (id: string) => sourceIds.has(id) ? { setData: () => { fleetSetDataCalls += 1; } } : undefined,
    addSource: (id: string) => { sourceIds.add(id); },
    getLayer: (id: string) => layerIds.has(id) ? { id } : undefined,
    addLayer: (layer: { id: string }, before?: string) => { layerIds.add(layer.id); addedLayers.push({ id: layer.id, before }); },
    getStyle: () => ({ layers: [{ id: "basemap-labels", type: "symbol" }] }),
  } as unknown as MapLibreMap;

  ensureCityGeofenceLayers(fakeMap, configured);
  sourceIds.add("fleet-vehicles");
  (fakeMap.getSource("fleet-vehicles") as unknown as { setData(): void }).setData();
  ensureCityGeofenceLayers(fakeMap, configured);

  assert.deepEqual([...sourceIds].sort(), [CITY_GEOFENCE_SOURCE_ID, "fleet-vehicles"]);
  assert.deepEqual(addedLayers, [
    { id: CITY_GEOFENCE_FILL_LAYER_ID, before: "basemap-labels" },
    { id: CITY_GEOFENCE_OUTLINE_LAYER_ID, before: "basemap-labels" },
  ]);
  assert.equal(fleetSetDataCalls, 1);
});
