import assert from "node:assert/strict";
import test from "node:test";
import type { Map as MapLibreMap } from "maplibre-gl";
import { ensureCityGeofenceLayers } from "../city-geofence/city-geofence-map";
import {
  FLEET_MAP_OVERLAY_LAYER_ORDER,
  FLEET_MAP_SOURCE_ID,
  ensureFleetAlertMapLayers,
} from "./open-alert-map-layers";

test("installs geofence, vehicle, alert, and selected layers once in deterministic order", () => {
  const sources = new Map<string, { setData(value: unknown): void }>();
  const layers: Array<{ id: string; type: string }> = [{ id: "basemap-labels", type: "symbol" }];
  let setDataCalls = 0;
  const map = {
    getSource: (id: string) => sources.get(id),
    addSource: (id: string) => { sources.set(id, { setData: () => { setDataCalls += 1; } }); },
    getLayer: (id: string) => layers.find((layer) => layer.id === id),
    addLayer: (layer: { id: string; type: string }, before?: string) => { const index = before === undefined ? -1 : layers.findIndex((item) => item.id === before); if (index < 0) layers.push({ id: layer.id, type: layer.type }); else layers.splice(index, 0, { id: layer.id, type: layer.type }); },
    getStyle: () => ({ layers }),
  } as unknown as MapLibreMap;
  const data = { type: "FeatureCollection" as const, features: [] };
  ensureCityGeofenceLayers(map, null);
  ensureFleetAlertMapLayers(map, data, null);
  (map.getSource(FLEET_MAP_SOURCE_ID) as unknown as { setData(value: unknown): void }).setData(data);
  ensureFleetAlertMapLayers(map, data, null);
  assert.deepEqual(layers.map((layer) => layer.id), ["city-geofence-fill", "city-geofence-outline", "basemap-labels", ...FLEET_MAP_OVERLAY_LAYER_ORDER]);
  assert.equal(sources.size, 2);
  assert.equal(setDataCalls, 1);
});
