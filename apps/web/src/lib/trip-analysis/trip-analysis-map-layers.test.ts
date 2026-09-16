import assert from "node:assert/strict";
import test from "node:test";
import type { CircleLayerSpecification, LineLayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import { FLEET_MAP_PRESENTATION } from "../fleet-map/fleet-map-presentation";
import { EMPTY_VEHICLE_TRACK_PRESENTATION } from "../vehicle-track/vehicle-track-presentation";
import {
  ensureTripMapLayers,
  TRIP_MAP_ENDPOINT_LAYER_ID,
  TRIP_MAP_LAYER_ORDER,
  TRIP_MAP_LEGEND_ITEMS,
  TRIP_MAP_LINE_LAYER_ID,
  TRIP_MAP_LINE_SOURCE_ID,
  TRIP_MAP_NORMAL_POINT_LAYER_ID,
  TRIP_MAP_POINT_SOURCE_ID,
  TRIP_MAP_PRESENTATION,
  TRIP_MAP_WARNING_ACCENT_LAYER_ID,
  tripMapLayers,
  updateTripMapData,
  ensureTripEventLayer,
  updateTripEventData,
  tripEventGeoJson,
  tripEventLayers,
  TRIP_EVENT_SOURCE_ID,
  TRIP_EVENT_HALO_LAYER_ID,
  TRIP_EVENT_MARKER_LAYER_ID,
  ensureTripSpeedingRouteLayer,
  updateTripSpeedingRouteData,
  TRIP_SPEEDING_ROUTE_SOURCE_ID,
  TRIP_SPEEDING_ROUTE_LAYER_ID,
  tripSpeedingRouteLayer,
} from "./trip-analysis-map-layers";

test("Trip Map geometry follows the accepted fleet marker grammar and keeps warnings additive", () => {
  const layers = tripMapLayers();
  const circle = (id: string): CircleLayerSpecification => {
    const layer = layers.find((candidate) => candidate.id === id);
    assert.equal(layer?.type, "circle");
    return layer as CircleLayerSpecification;
  };
  const normal = circle(TRIP_MAP_NORMAL_POINT_LAYER_ID);
  const warning = circle(TRIP_MAP_WARNING_ACCENT_LAYER_ID);
  const endpoints = circle(TRIP_MAP_ENDPOINT_LAYER_ID);
  assert.equal(normal.paint?.["circle-opacity"], 1);
  assert.equal(normal.paint?.["circle-stroke-width"], 2);
  assert.equal(normal.paint?.["circle-stroke-color"], FLEET_MAP_PRESENTATION.markerOutline);
  assert.deepEqual(normal.paint?.["circle-radius"], ["interpolate", ["linear"], ["zoom"], 9, 3, 15, FLEET_MAP_PRESENTATION.baseRadius]);
  assert.equal(warning.paint?.["circle-color"], "transparent");
  assert.equal(warning.paint?.["circle-stroke-width"], 2.5);
  assert.deepEqual(warning.paint?.["circle-radius"], ["interpolate", ["linear"], ["zoom"], 9, 7, 15, FLEET_MAP_PRESENTATION.speedingRadius]);
  assert.deepEqual(endpoints.paint?.["circle-color"], ["match", ["get", "endpoint"], "start", FLEET_MAP_PRESENTATION.fresh, "end", FLEET_MAP_PRESENTATION.speeding, TRIP_MAP_PRESENTATION.observationColor]);
});

test("Legend semantics stay synchronized with the complete Trips layer vocabulary", () => {
  assert.deepEqual(TRIP_MAP_LEGEND_ITEMS.map((item) => item.kind), ["route", "observation", "warning", "start", "end", "stop"]);
  assert.deepEqual(TRIP_MAP_LAYER_ORDER, ["trips-speeding-route-line", "trips-map-line", "trips-map-points-warning-accent", "trips-map-points-normal", "trips-map-endpoints"]);
});

test("speeding presentation is a translucent red underlay wider than the blue route", () => {
  const route = tripMapLayers().find((layer) => layer.id === TRIP_MAP_LINE_LAYER_ID) as LineLayerSpecification;
  const speeding = tripSpeedingRouteLayer();
  assert.equal(speeding.paint?.["line-color"], TRIP_MAP_PRESENTATION.eventColor);
  assert.deepEqual(route.paint?.["line-width"], ["interpolate", ["linear"], ["zoom"], 9, 2, 15, 4]);
  assert.deepEqual(speeding.paint?.["line-width"], ["interpolate", ["linear"], ["zoom"], 9, 5, 15, 8]);
  assert.equal(speeding.paint?.["line-opacity"], 0.42);
  assert.ok((speeding.paint?.["line-opacity"] as number) < 0.5);
  assert.equal(speeding.layout?.["line-cap"], "round");
  assert.equal(speeding.layout?.["line-join"], "round");
});

test("Trip Map sources and layers are created once below labels and data updates in place", () => {
  const sources = new Map<string, { setData(value: unknown): void }>();
  const layers: Array<{ id: string; type: string }> = [{ id: "basemap-labels", type: "symbol" }];
  let setDataCalls = 0;
  const map = {
    getSource: (id: string) => sources.get(id),
    addSource: (id: string) => sources.set(id, { setData: () => { setDataCalls += 1; } }),
    getLayer: (id: string) => layers.find((layer) => layer.id === id),
    addLayer: (layer: { id: string; type: string }, before?: string) => {
      const index = before ? layers.findIndex((item) => item.id === before) : -1;
      if (index < 0) layers.push({ id: layer.id, type: layer.type });
      else layers.splice(index, 0, { id: layer.id, type: layer.type });
    },
    getStyle: () => ({ layers }),
  } as unknown as MapLibreMap;
  ensureTripMapLayers(map, EMPTY_VEHICLE_TRACK_PRESENTATION);
  ensureTripMapLayers(map, EMPTY_VEHICLE_TRACK_PRESENTATION);
  ensureTripSpeedingRouteLayer(map);
  ensureTripSpeedingRouteLayer(map);
  updateTripMapData(map, EMPTY_VEHICLE_TRACK_PRESENTATION);
  updateTripSpeedingRouteData(map, { type: "FeatureCollection", features: [] });
  assert.equal(sources.has(TRIP_MAP_LINE_SOURCE_ID), true);
  assert.equal(sources.has(TRIP_MAP_POINT_SOURCE_ID), true);
  assert.equal(sources.has(TRIP_SPEEDING_ROUTE_SOURCE_ID), true);
  assert.equal(sources.size, 3);
  assert.equal(setDataCalls, 3);
  assert.deepEqual(layers.map((layer) => layer.id), [...TRIP_MAP_LAYER_ORDER, "basemap-labels"]);
  assert.ok(layers.findIndex((layer) => layer.id === TRIP_SPEEDING_ROUTE_LAYER_ID) < layers.findIndex((layer) => layer.id === TRIP_MAP_LINE_LAYER_ID));
  assert.ok(layers.findIndex((layer) => layer.id === TRIP_MAP_LINE_LAYER_ID) < layers.findIndex((layer) => layer.id === TRIP_MAP_WARNING_ACCENT_LAYER_ID));
});

test("persisted event coordinates create an independent marker above route layers and survive an empty track", () => {
  assert.deepEqual(tripEventGeoJson({ latitude: 49.23, longitude: 28.48 }).features[0]?.geometry.coordinates, [28.48, 49.23]);
  assert.equal(tripEventGeoJson(null).features.length, 0);
  assert.equal(tripEventLayers().at(-1)?.id, TRIP_EVENT_MARKER_LAYER_ID);
  const sources = new Map<string, { data?: unknown; setData(value: unknown): void }>();
  const layers: Array<{ id: string; type: string }> = [{ id: "trips-map-endpoints", type: "circle" }, { id: "labels", type: "symbol" }];
  const map = {
    getSource: (id: string) => sources.get(id),
    addSource: (id: string, source: { data?: unknown }) => sources.set(id, { data: source.data, setData(value) { this.data = value; } }),
    getLayer: (id: string) => layers.find((layer) => layer.id === id),
    addLayer: (layer: { id: string; type: string }, before?: string) => layers.splice(before ? layers.findIndex((item) => item.id === before) : layers.length, 0, { id: layer.id, type: layer.type }),
    getStyle: () => ({ layers }),
  } as unknown as MapLibreMap;
  ensureTripEventLayer(map, { latitude: 49.23, longitude: 28.48 });
  updateTripEventData(map, { latitude: 49.24, longitude: 28.49 });
  assert.equal(sources.has(TRIP_EVENT_SOURCE_ID), true);
  assert.ok(layers.findIndex((layer) => layer.id === TRIP_EVENT_HALO_LAYER_ID) > layers.findIndex((layer) => layer.id === "trips-map-endpoints"));
  assert.ok(layers.findIndex((layer) => layer.id === TRIP_EVENT_MARKER_LAYER_ID) > layers.findIndex((layer) => layer.id === TRIP_EVENT_HALO_LAYER_ID));
  assert.ok(layers.findIndex((layer) => layer.id === TRIP_EVENT_MARKER_LAYER_ID) > layers.findIndex((layer) => layer.id === "trips-map-endpoints"));
  assert.deepEqual((sources.get(TRIP_EVENT_SOURCE_ID)?.data as ReturnType<typeof tripEventGeoJson>).features[0]?.geometry.coordinates, [28.49, 49.24]);
});

test("speeding confirmation marker stays prominent without dominating the route", () => {
  const [halo, marker] = tripEventLayers();
  assert.equal(TRIP_MAP_PRESENTATION.eventColor, FLEET_MAP_PRESENTATION.speeding);
  assert.equal(TRIP_MAP_PRESENTATION.eventRadius, 8);
  assert.equal(TRIP_MAP_PRESENTATION.eventHaloRadius, 14);
  assert.ok(TRIP_MAP_PRESENTATION.eventRadius > FLEET_MAP_PRESENTATION.baseRadius);
  assert.ok(TRIP_MAP_PRESENTATION.eventHaloRadius < FLEET_MAP_PRESENTATION.hitRadius);
  assert.deepEqual(marker?.paint?.["circle-radius"], ["interpolate", ["linear"], ["zoom"], 10, 6, 16, TRIP_MAP_PRESENTATION.eventRadius]);
  assert.equal(marker?.paint?.["circle-stroke-width"], 2);
  assert.equal(marker?.paint?.["circle-stroke-color"], FLEET_MAP_PRESENTATION.markerOutline);
  assert.deepEqual(halo?.paint?.["circle-radius"], ["interpolate", ["linear"], ["zoom"], 10, 10, 16, TRIP_MAP_PRESENTATION.eventHaloRadius]);
});
