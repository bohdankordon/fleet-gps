import assert from "node:assert/strict";
import test from "node:test";
import type { Map as MapLibreMap } from "maplibre-gl";
import { trackFixture, trackPoint } from "../vehicle-track/vehicle-track-fixture";
import {
  EMPTY_VEHICLE_TRACK_PRESENTATION,
  buildVehicleTrackPresentation,
  type VehicleTrackPresentationModel,
} from "../vehicle-track/vehicle-track-presentation";
import {
  TRIP_EVENT_SOURCE_ID,
  TRIP_MAP_LINE_SOURCE_ID,
  TRIP_MAP_POINT_SOURCE_ID,
  TRIP_SPEEDING_ROUTE_SOURCE_ID,
  type TripEventPosition,
} from "./trip-analysis-map-layers";
import { synchronizeTripMap, tripMapSourcesExist, type TripMapSyncInput } from "./trip-analysis-map-sync";
import type { SpeedingRouteGeoJson } from "./trip-analysis-speeding-route";
import { selectedStopBoundaryPresentation } from "./trip-analysis-selection";
import type { TripAnalysisSelection } from "./trip-analysis-timeline";

type FakeSource = {
  data: unknown;
  setData(value: unknown): void;
};

type FakeTripMap = {
  map: MapLibreMap;
  sources: Map<string, FakeSource>;
  setStyleLoaded(next: boolean): void;
  preseedSource(id: string, data: unknown): void;
  addSourceCalls(): number;
  addLayerCalls(): number;
  resizeCalls(): number;
};

function createFakeTripMap(initialStyleLoaded: boolean): FakeTripMap {
  let styleLoaded = initialStyleLoaded;
  const sources = new Map<string, FakeSource>();
  const layers: Array<{ id: string; type: string }> = [{ id: "basemap-labels", type: "symbol" }];
  let addSourceCount = 0;
  let addLayerCount = 0;
  let resizeCount = 0;
  const addSource = (id: string, source: { data?: unknown }): void => {
    addSourceCount += 1;
    const entry: FakeSource = {
      data: source.data,
      setData(value: unknown) {
        this.data = value;
      },
    };
    sources.set(id, entry);
  };
  const map = {
    isStyleLoaded: () => styleLoaded,
    getSource: (id: string) => sources.get(id),
    addSource,
    getLayer: (id: string) => layers.find((layer) => layer.id === id),
    addLayer: (layer: { id: string; type: string }, before?: string) => {
      addLayerCount += 1;
      const index = before ? layers.findIndex((item) => item.id === before) : -1;
      if (index < 0) layers.push({ id: layer.id, type: layer.type });
      else layers.splice(index, 0, { id: layer.id, type: layer.type });
    },
    getStyle: () => ({ layers }),
    resize: () => {
      resizeCount += 1;
    },
  } as unknown as MapLibreMap;
  return {
    map,
    sources,
    setStyleLoaded(next: boolean) {
      styleLoaded = next;
    },
    preseedSource(id: string, data: unknown) {
      addSource(id, { data });
    },
    addSourceCalls: () => addSourceCount,
    addLayerCalls: () => addLayerCount,
    resizeCalls: () => resizeCount,
  };
}

const EMPTY_SPEEDING_ROUTE: SpeedingRouteGeoJson = { type: "FeatureCollection", features: [] };

function tripModel(): VehicleTrackPresentationModel {
  return buildVehicleTrackPresentation(
    trackFixture([
      trackPoint("2026-08-10T10:00:00.000Z", { latitude: 49.2, longitude: 28.4 }),
      trackPoint("2026-08-10T10:01:00.000Z", { latitude: 49.21, longitude: 28.41 }),
      trackPoint("2026-08-10T10:02:00.000Z", { latitude: 49.22, longitude: 28.42 }),
      trackPoint("2026-08-10T10:03:00.000Z", { latitude: 49.23, longitude: 28.43 }),
    ]),
  );
}

function stopModel(): VehicleTrackPresentationModel {
  const startAt = "2026-08-10T10:00:00.000Z";
  const endAt = "2026-08-10T10:05:00.000Z";
  const selection: TripAnalysisSelection = {
    key: "stop-0",
    kind: "STOP",
    startAt,
    endAt,
    value: {
      startAt,
      endAt,
      durationSeconds: 300,
      startPosition: { latitude: 49.2, longitude: 28.4, observedAt: startAt },
      endPosition: { latitude: 49.2005, longitude: 28.4005, observedAt: endAt },
      observationCount: 2,
      terminationReason: "MOVEMENT",
      endClipped: false,
    },
  };
  const model = selectedStopBoundaryPresentation(selection);
  assert.ok(model);
  return model;
}

function speedingRoute(): SpeedingRouteGeoJson {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { segmentIndex: 0 },
        geometry: { type: "LineString", coordinates: [[28.4, 49.2], [28.41, 49.21]] },
      },
    ],
  };
}

function syncLatest(fake: FakeTripMap, input: TripMapSyncInput, structuralReady: boolean) {
  let cameraInput: TripMapSyncInput | null = null;
  const status = synchronizeTripMap(fake.map, input, {
    applyCamera: () => {
      cameraInput = input;
    },
    structuralReady,
  });
  return { status, cameraInput: () => cameraInput };
}

function sourceData(fake: FakeTripMap, id: string): unknown {
  return fake.sources.get(id)?.data;
}

function featureCount(fake: FakeTripMap, id: string): number {
  return (sourceData(fake, id) as { features: unknown[] }).features.length;
}

test("pre-load pending performs no map work and replays latest refs on load", () => {
  const fake = createFakeTripMap(false);
  assert.equal(tripMapSourcesExist(fake.map), false);
  const valid = tripModel();
  const eventPosition: TripEventPosition = { latitude: 49.25, longitude: 28.45 };
  const route = speedingRoute();
  const input: TripMapSyncInput = { model: valid, speedingRoute: route, eventPosition };

  const pending = syncLatest(fake, input, false);
  assert.equal(pending.status, "pending");
  assert.equal(fake.addSourceCalls(), 0);
  assert.equal(fake.addLayerCalls(), 0);
  assert.equal(pending.cameraInput(), null);
  assert.equal(fake.resizeCalls(), 0);
  assert.equal(tripMapSourcesExist(fake.map), false);

  // Even if the style momentarily reports loaded, structure must not be
  // created before the initial load event establishes structural readiness.
  fake.setStyleLoaded(true);
  const stillPending = syncLatest(fake, input, false);
  assert.equal(stillPending.status, "pending");
  assert.equal(fake.addSourceCalls(), 0);
  assert.equal(fake.addLayerCalls(), 0);
  assert.equal(stillPending.cameraInput(), null);
  assert.equal(fake.resizeCalls(), 0);

  // Initial load replays the latest refs in one complete pass.
  const loaded = syncLatest(fake, input, true);
  assert.equal(loaded.status, "synced");
  assert.equal(tripMapSourcesExist(fake.map), true);
  assert.equal(fake.addSourceCalls(), 4);
  assert.equal(fake.addLayerCalls(), 7);
  assert.deepEqual(sourceData(fake, TRIP_MAP_LINE_SOURCE_ID), valid.lineGeoJson);
  assert.deepEqual(sourceData(fake, TRIP_MAP_POINT_SOURCE_ID), valid.pointGeoJson);
  assert.deepEqual(sourceData(fake, TRIP_SPEEDING_ROUTE_SOURCE_ID), route);
  assert.equal(featureCount(fake, TRIP_EVENT_SOURCE_ID), 1);
  assert.equal(loaded.cameraInput(), input);
  assert.ok(fake.resizeCalls() >= 1);
});

test("post-load partial structure is repaired while another source is busy", () => {
  const fake = createFakeTripMap(true);
  // Post-load map where only the line source survived (interrupted creation),
  // now busy processing: structural readiness holds while style idleness does not.
  fake.preseedSource(TRIP_MAP_LINE_SOURCE_ID, EMPTY_VEHICLE_TRACK_PRESENTATION.lineGeoJson);
  fake.setStyleLoaded(false);

  const valid = tripModel();
  const eventPosition: TripEventPosition = { latitude: 49.25, longitude: 28.45 };
  const route = speedingRoute();
  const input: TripMapSyncInput = { model: valid, speedingRoute: route, eventPosition };
  const result = syncLatest(fake, input, true);

  // Structural readiness is independent of transient source-worker readiness:
  // the helper must not return pending merely because isStyleLoaded is false.
  assert.equal(result.status, "synced");
  assert.equal(tripMapSourcesExist(fake.map), true);
  assert.equal(fake.addSourceCalls(), 4);
  assert.equal(fake.addLayerCalls(), 7);
  assert.deepEqual(sourceData(fake, TRIP_MAP_LINE_SOURCE_ID), valid.lineGeoJson);
  assert.deepEqual(sourceData(fake, TRIP_MAP_POINT_SOURCE_ID), valid.pointGeoJson);
  assert.deepEqual(sourceData(fake, TRIP_SPEEDING_ROUTE_SOURCE_ID), route);
  assert.equal(featureCount(fake, TRIP_EVENT_SOURCE_ID), 1);
  assert.equal(result.cameraInput(), input);
  assert.ok(fake.resizeCalls() >= 1);
});

test("post-load existing sources converge while the style reports not loaded (rapid-selection race)", () => {
  const fake = createFakeTripMap(true);
  const initial = syncLatest(
    fake,
    {
      model: EMPTY_VEHICLE_TRACK_PRESENTATION,
      speedingRoute: EMPTY_SPEEDING_ROUTE,
      eventPosition: null,
    },
    true,
  );
  assert.equal(initial.status, "synced");
  assert.equal(tripMapSourcesExist(fake.map), true);

  // MapLibre becomes temporarily not-loaded while processing the EMPTY write.
  // The old isStyleLoaded() gate skipped the next update here with no replay.
  fake.setStyleLoaded(false);

  const valid = tripModel();
  assert.equal(valid.pointGeoJson.features.length, 4);
  assert.equal(valid.lineGeoJson.features.length, 1);
  const eventPosition: TripEventPosition = { latitude: 49.25, longitude: 28.45 };
  const route = speedingRoute();
  const result = syncLatest(fake, { model: valid, speedingRoute: route, eventPosition }, true);

  assert.equal(result.status, "synced");
  assert.deepEqual(sourceData(fake, TRIP_MAP_LINE_SOURCE_ID), valid.lineGeoJson);
  assert.deepEqual(sourceData(fake, TRIP_MAP_POINT_SOURCE_ID), valid.pointGeoJson);
  assert.deepEqual(sourceData(fake, TRIP_SPEEDING_ROUTE_SOURCE_ID), route);
  assert.equal(featureCount(fake, TRIP_EVENT_SOURCE_ID), 1);
  assert.equal(result.cameraInput()?.model, valid);
  assert.equal(result.cameraInput()?.eventPosition, eventPosition);
  assert.ok(fake.resizeCalls() >= 1);
});

test("EMPTY then VALID rapid sequence converges to the valid model", () => {
  const fake = createFakeTripMap(true);
  const cleared = syncLatest(
    fake,
    {
      model: EMPTY_VEHICLE_TRACK_PRESENTATION,
      speedingRoute: EMPTY_SPEEDING_ROUTE,
      eventPosition: null,
    },
    true,
  );
  assert.equal(cleared.status, "synced");
  assert.deepEqual(sourceData(fake, TRIP_MAP_POINT_SOURCE_ID), EMPTY_VEHICLE_TRACK_PRESENTATION.pointGeoJson);

  fake.setStyleLoaded(false);
  const valid = tripModel();
  const converged = syncLatest(
    fake,
    {
      model: valid,
      speedingRoute: EMPTY_SPEEDING_ROUTE,
      eventPosition: null,
    },
    true,
  );
  assert.equal(converged.status, "synced");
  assert.equal(featureCount(fake, TRIP_MAP_POINT_SOURCE_ID), 4);
  assert.equal(featureCount(fake, TRIP_MAP_LINE_SOURCE_ID), 1);
  assert.deepEqual(sourceData(fake, TRIP_MAP_POINT_SOURCE_ID), valid.pointGeoJson);
  assert.deepEqual(sourceData(fake, TRIP_MAP_LINE_SOURCE_ID), valid.lineGeoJson);
  assert.equal(converged.cameraInput()?.model, valid);
});

test("STOP to TRIP converges to the trip track while the style is busy", () => {
  const fake = createFakeTripMap(true);
  const stop = stopModel();
  assert.equal(
    syncLatest(fake, { model: stop, speedingRoute: EMPTY_SPEEDING_ROUTE, eventPosition: null }, true).status,
    "synced",
  );
  assert.equal(featureCount(fake, TRIP_MAP_POINT_SOURCE_ID), 2);
  assert.equal(featureCount(fake, TRIP_MAP_LINE_SOURCE_ID), 0);

  fake.setStyleLoaded(false);
  const trip = tripModel();
  const result = syncLatest(
    fake,
    {
      model: trip,
      speedingRoute: EMPTY_SPEEDING_ROUTE,
      eventPosition: null,
    },
    true,
  );
  assert.equal(result.status, "synced");
  assert.deepEqual(sourceData(fake, TRIP_MAP_POINT_SOURCE_ID), trip.pointGeoJson);
  assert.deepEqual(sourceData(fake, TRIP_MAP_LINE_SOURCE_ID), trip.lineGeoJson);
  assert.equal(result.cameraInput()?.model, trip);
});

test("TRIP to STOP converges to stop boundaries while the style is busy", () => {
  const fake = createFakeTripMap(true);
  const trip = tripModel();
  assert.equal(
    syncLatest(fake, { model: trip, speedingRoute: EMPTY_SPEEDING_ROUTE, eventPosition: null }, true).status,
    "synced",
  );

  fake.setStyleLoaded(false);
  const stop = stopModel();
  const result = syncLatest(
    fake,
    {
      model: stop,
      speedingRoute: EMPTY_SPEEDING_ROUTE,
      eventPosition: null,
    },
    true,
  );
  assert.equal(result.status, "synced");
  const points = sourceData(fake, TRIP_MAP_POINT_SOURCE_ID) as {
    features: Array<{ properties: { endpoint: string } }>;
  };
  assert.equal(points.features.length, 2);
  assert.deepEqual(
    points.features.map((feature) => feature.properties.endpoint),
    ["start", "end"],
  );
  assert.equal(featureCount(fake, TRIP_MAP_LINE_SOURCE_ID), 0);
  assert.equal(result.cameraInput()?.model, stop);
});

test("camera always follows the same latest model and event that reached the sources", () => {
  const fake = createFakeTripMap(true);
  const firstTrip = tripModel();
  const firstEvent: TripEventPosition = { latitude: 49.2, longitude: 28.4 };
  syncLatest(fake, { model: firstTrip, speedingRoute: EMPTY_SPEEDING_ROUTE, eventPosition: firstEvent }, true);

  fake.setStyleLoaded(false);
  const latest = stopModel();
  const latestEvent: TripEventPosition = { latitude: 49.3, longitude: 28.5 };
  const result = syncLatest(
    fake,
    {
      model: latest,
      speedingRoute: EMPTY_SPEEDING_ROUTE,
      eventPosition: latestEvent,
    },
    true,
  );

  assert.equal(result.status, "synced");
  assert.deepEqual(sourceData(fake, TRIP_MAP_POINT_SOURCE_ID), latest.pointGeoJson);
  assert.equal(result.cameraInput()?.model, latest);
  assert.equal(result.cameraInput()?.eventPosition, latestEvent);
});

test("rapid randomized selection bursts always converge to the final model", () => {
  const trip = tripModel();
  const stop = stopModel();
  const candidates: readonly VehicleTrackPresentationModel[] = [EMPTY_VEHICLE_TRACK_PRESENTATION, trip, stop];
  let seed = 0x2f6e2b1;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed;
  };
  let lost = 0;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const fake = createFakeTripMap(true);
    const first = candidates[next() % candidates.length];
    assert.ok(first);
    syncLatest(fake, { model: first, speedingRoute: EMPTY_SPEEDING_ROUTE, eventPosition: null }, true);
    const burst = 2 + (next() % 6);
    let latest: VehicleTrackPresentationModel = EMPTY_VEHICLE_TRACK_PRESENTATION;
    for (let step = 0; step < burst; step += 1) {
      const candidate = candidates[next() % candidates.length];
      assert.ok(candidate);
      latest = candidate;
      // Ordinary source worker activity flips readiness between writes.
      fake.setStyleLoaded(next() % 2 === 0);
      syncLatest(fake, { model: latest, speedingRoute: EMPTY_SPEEDING_ROUTE, eventPosition: null }, true);
    }
    // The burst ends while the map is still busy with no further React change:
    // the confirmed failure mode left the previous EMPTY behind.
    fake.setStyleLoaded(false);
    const finalInput: TripMapSyncInput = {
      model: latest,
      speedingRoute: EMPTY_SPEEDING_ROUTE,
      eventPosition: null,
    };
    let cameraInput: TripMapSyncInput | null = null;
    const status = synchronizeTripMap(fake.map, finalInput, {
      applyCamera: () => {
        cameraInput = finalInput;
      },
      structuralReady: true,
    });
    const converged =
      status === "synced" &&
      JSON.stringify(sourceData(fake, TRIP_MAP_POINT_SOURCE_ID)) === JSON.stringify(latest.pointGeoJson) &&
      JSON.stringify(sourceData(fake, TRIP_MAP_LINE_SOURCE_ID)) === JSON.stringify(latest.lineGeoJson) &&
      cameraInput === finalInput;
    if (!converged) lost += 1;
  }
  assert.equal(lost, 0);
});

test("synchronize handles a missing map without side effects", () => {
  let cameraCalls = 0;
  assert.equal(
    synchronizeTripMap(
      null,
      { model: EMPTY_VEHICLE_TRACK_PRESENTATION, speedingRoute: EMPTY_SPEEDING_ROUTE, eventPosition: null },
      {
        applyCamera: () => {
          cameraCalls += 1;
        },
        structuralReady: true,
      },
    ),
    "no-map",
  );
  assert.equal(cameraCalls, 0);
});

