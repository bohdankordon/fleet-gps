import assert from "node:assert/strict";
import test from "node:test";
import type { Map as MapLibreMap } from "maplibre-gl";
import { ensureCityGeofenceLayers } from "../city-geofence/city-geofence-map";
import { trackFixture, trackPoint } from "./vehicle-track-fixture";
import { ensureVehicleTrackLayers, updateVehicleTrackMapData, VEHICLE_TRACK_LAYER_ORDER, VEHICLE_TRACK_LINE_SOURCE_ID, VEHICLE_TRACK_POINT_SOURCE_ID } from "./vehicle-track-layers";
import { buildVehicleTrackPresentation } from "./vehicle-track-presentation";

test("creates sources/layers once below labels and above geofence, then refreshes via setData", () => {
  const sources = new Map<string, { setData(value: unknown): void }>(); const layers: Array<{ id: string; type: string }> = [{ id: "basemap-labels", type: "symbol" }]; let setDataCalls = 0; let filterCalls = 0;
  const map = {
    getSource: (id: string) => sources.get(id), addSource: (id: string) => { sources.set(id, { setData: () => { setDataCalls += 1; } }); }, getLayer: (id: string) => layers.find((layer) => layer.id === id),
    addLayer: (layer: { id: string; type: string }, before?: string) => { const index = before ? layers.findIndex((item) => item.id === before) : -1; if (index < 0) layers.push({ id: layer.id, type: layer.type }); else layers.splice(index, 0, { id: layer.id, type: layer.type }); },
    getStyle: () => ({ layers }), setFilter: () => { filterCalls += 1; },
  } as unknown as MapLibreMap;
  const model = buildVehicleTrackPresentation(trackFixture([trackPoint(), trackPoint("2026-08-10T10:00:01Z")]));
  ensureCityGeofenceLayers(map, null); ensureVehicleTrackLayers(map, model, null); ensureVehicleTrackLayers(map, model, null); updateVehicleTrackMapData(map, model, "1");
  assert.deepEqual(layers.map((layer) => layer.id), ["city-geofence-fill", "city-geofence-outline", ...VEHICLE_TRACK_LAYER_ORDER, "basemap-labels"]);
  assert.equal(sources.has(VEHICLE_TRACK_LINE_SOURCE_ID), true); assert.equal(sources.has(VEHICLE_TRACK_POINT_SOURCE_ID), true); assert.equal(sources.size, 3); assert.equal(setDataCalls, 2); assert.equal(filterCalls, 1);
});
