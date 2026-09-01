import assert from "node:assert/strict";
import test from "node:test";
import type { CircleLayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import { ensureCityGeofenceLayers } from "../city-geofence/city-geofence-map";
import { FLEET_MAP_INACTIVITY_IMAGE_ID, FLEET_MAP_PRESENTATION } from "../fleet-map/fleet-map-presentation";
import {
  FLEET_MAP_HIT_LAYER_ID,
  FLEET_MAP_OVERLAY_LAYER_ORDER,
  FLEET_MAP_PROMOTED_ID_PROPERTY,
  FLEET_MAP_SELECTED_LAYER_ID,
  FLEET_MAP_SOURCE_ID,
  OPEN_ALERT_INACTIVITY_LAYER_ID,
  OPEN_ALERT_SPEEDING_LAYER_ID,
  ensureFleetAlertMapLayers,
  fleetAlertMapLayers,
} from "./open-alert-map-layers";

test("installs geofence, vehicle, alert, and selected layers once in deterministic order", () => {
  const sources = new Map<string, { setData(value: unknown): void }>();
  const layers: Array<{ id: string; type: string }> = [{ id: "basemap-labels", type: "symbol" }];
  let setDataCalls = 0;
  let fleetSourceOptions: unknown;
  const images = new Set<string>();
  const map = {
    getSource: (id: string) => sources.get(id),
    addSource: (id: string, options: unknown) => { if (id === FLEET_MAP_SOURCE_ID) fleetSourceOptions = options; sources.set(id, { setData: () => { setDataCalls += 1; } }); },
    getLayer: (id: string) => layers.find((layer) => layer.id === id),
    addLayer: (layer: { id: string; type: string }, before?: string) => { const index = before === undefined ? -1 : layers.findIndex((item) => item.id === before); if (index < 0) layers.push({ id: layer.id, type: layer.type }); else layers.splice(index, 0, { id: layer.id, type: layer.type }); },
    getStyle: () => ({ layers }),
    hasImage: (id: string) => images.has(id),
    addImage: (id: string) => { images.add(id); },
  } as unknown as MapLibreMap;
  const data = { type: "FeatureCollection" as const, features: [] };
  const inactivityRing = { image: { width: 28, height: 28, data: new Uint8ClampedArray(28 * 28 * 4), colorSpace: "srgb" } as ImageData, pixelRatio: 1 };
  ensureCityGeofenceLayers(map, null);
  ensureFleetAlertMapLayers(map, data, null, inactivityRing);
  (map.getSource(FLEET_MAP_SOURCE_ID) as unknown as { setData(value: unknown): void }).setData(data);
  ensureFleetAlertMapLayers(map, data, null, inactivityRing);
  assert.deepEqual(layers.map((layer) => layer.id), ["city-geofence-fill", "city-geofence-outline", "basemap-labels", ...FLEET_MAP_OVERLAY_LAYER_ORDER]);
  assert.equal(sources.size, 2);
  assert.equal(setDataCalls, 1);
  assert.deepEqual([...images], [FLEET_MAP_INACTIVITY_IMAGE_ID]);
  assert.deepEqual(fleetSourceOptions, { type: "geojson", data, promoteId: FLEET_MAP_PROMOTED_ID_PROPERTY });
});

test("layers implement the accepted base, event-priority, selection, and hover grammar", () => {
  const layers = fleetAlertMapLayers("vehicle-1");
  const vehicle = layers.find((layer) => layer.id === "fleet-vehicles")! as CircleLayerSpecification;
  const speeding = layers.find((layer) => layer.id === OPEN_ALERT_SPEEDING_LAYER_ID)! as CircleLayerSpecification;
  const inactivity = layers.find((layer) => layer.id === OPEN_ALERT_INACTIVITY_LAYER_ID)!;
  const selected = layers.find((layer) => layer.id === FLEET_MAP_SELECTED_LAYER_ID)! as CircleLayerSpecification;
  assert.deepEqual(vehicle.paint?.["circle-color"], ["match", ["get", "freshness"], "FRESH", FLEET_MAP_PRESENTATION.fresh, FLEET_MAP_PRESENTATION.stale]);
  assert.deepEqual(vehicle.paint?.["circle-radius"], ["case", ["boolean", ["feature-state", "hover"], false], FLEET_MAP_PRESENTATION.baseRadius * FLEET_MAP_PRESENTATION.hoverScale, FLEET_MAP_PRESENTATION.baseRadius]);
  assert.deepEqual(speeding.filter, ["==", ["get", "eventPresentation"], "SPEEDING"]);
  assert.equal(speeding.paint?.["circle-stroke-color"], FLEET_MAP_PRESENTATION.speeding);
  assert.equal(inactivity.type, "symbol");
  assert.deepEqual(inactivity.filter, ["==", ["get", "eventPresentation"], "INACTIVITY"]);
  assert.equal(inactivity.layout?.["icon-image"], FLEET_MAP_INACTIVITY_IMAGE_ID);
  assert.deepEqual(selected.filter, ["==", ["get", "vehicleId"], "vehicle-1"]);
  assert.equal(selected.paint?.["circle-stroke-color"], FLEET_MAP_PRESENTATION.selected);
  assert.equal(selected.paint?.["circle-opacity"], 0);
  assert.deepEqual(FLEET_MAP_OVERLAY_LAYER_ORDER, ["fleet-vehicles", "fleet-alert-speeding", "fleet-alert-inactivity", "fleet-vehicles-selected", FLEET_MAP_HIT_LAYER_ID]);
  assert.equal(JSON.stringify({ layers, presentation: FLEET_MAP_PRESENTATION }).includes("#6e4aa1"), false);
});
