import type { Map as MapLibreMap } from "maplibre-gl";
import type { VehicleTrackPresentationModel } from "../vehicle-track/vehicle-track-presentation";
import {
  ensureTripEventLayer,
  ensureTripMapLayers,
  ensureTripSpeedingRouteLayer,
  TRIP_EVENT_SOURCE_ID,
  TRIP_MAP_LINE_SOURCE_ID,
  TRIP_MAP_POINT_SOURCE_ID,
  TRIP_SPEEDING_ROUTE_SOURCE_ID,
  updateTripEventData,
  updateTripMapData,
  updateTripSpeedingRouteData,
  type TripEventPosition,
} from "./trip-analysis-map-layers";
import type { SpeedingRouteGeoJson } from "./trip-analysis-speeding-route";

export type TripMapSyncInput = Readonly<{
  model: VehicleTrackPresentationModel;
  speedingRoute: SpeedingRouteGeoJson;
  eventPosition: TripEventPosition;
}>;

export type TripMapSyncStatus = "no-map" | "pending" | "synced";

/**
 * Convergence invariant for the Trips map.
 *
 * MapLibre reports `isStyleLoaded() === false` while a GeoJSON source is busy
 * processing previously written data, yet consecutive `setData()` calls on an
 * existing source remain safe and are queued/coalesced by MapLibre itself.
 * Gating updates on `isStyleLoaded()` therefore drops the latest model with no
 * later replay, which leaves the map empty after rapid Trips/Stops selection.
 *
 * The boundary used here is source existence, not style "loaded" state:
 *
 * - no map: nothing to synchronize now;
 * - required sources missing and the style is not structurally ready: never
 *   attempt `addSource`/`addLayer`; converge data into whatever sources already
 *   exist and leave the latest refs pending for the initial load handler;
 * - required sources missing and the style is structurally ready: create the
 *   sources/layers, then write the latest data;
 * - sources exist: always write the latest trip, speeding-route, and event
 *   data plus the camera for that same latest state, even when
 *   `isStyleLoaded()` is false.
 */
export function tripMapSourcesExist(map: MapLibreMap): boolean {
  return (
    map.getSource(TRIP_MAP_LINE_SOURCE_ID) != null &&
    map.getSource(TRIP_MAP_POINT_SOURCE_ID) != null &&
    map.getSource(TRIP_SPEEDING_ROUTE_SOURCE_ID) != null &&
    map.getSource(TRIP_EVENT_SOURCE_ID) != null
  );
}

export function synchronizeTripMap(
  map: MapLibreMap | null | undefined,
  input: TripMapSyncInput,
  applyCamera: (map: MapLibreMap) => void,
): TripMapSyncStatus {
  if (!map) return "no-map";
  if (!tripMapSourcesExist(map)) {
    if (!map.isStyleLoaded()) {
      updateTripMapData(map, input.model);
      updateTripSpeedingRouteData(map, input.speedingRoute);
      updateTripEventData(map, input.eventPosition);
      applyCamera(map);
      return "pending";
    }
    ensureTripMapLayers(map, input.model);
    ensureTripSpeedingRouteLayer(map, input.speedingRoute);
    ensureTripEventLayer(map, input.eventPosition);
  }
  updateTripMapData(map, input.model);
  updateTripSpeedingRouteData(map, input.speedingRoute);
  updateTripEventData(map, input.eventPosition);
  applyCamera(map);
  map.resize();
  return "synced";
}

