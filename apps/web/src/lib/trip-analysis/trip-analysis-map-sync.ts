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

export type TripMapSyncOptions = Readonly<{
  applyCamera: (map: MapLibreMap) => void;
  /**
   * Whether the Trips map has passed its initial MapLibre `load` event.
   *
   * This is the deterministic structural-readiness signal. MapLibre reports
   * `isStyleLoaded() === false` while existing sources have pending worker
   * activity, but `addSource`/`addLayer` only require the structural style
   * state that the initial `load` event establishes. Tracking the event
   * explicitly keeps post-load repair independent of transient source-idle
   * readiness.
   */
  structuralReady: boolean;
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
 * The boundary used here is explicit structural readiness plus source
 * existence, never transient style "loaded" state:
 *
 * - no map: nothing to synchronize now;
 * - structural readiness not yet established (initial `load` not fired):
 *   return pending without touching the map at all; the caller keeps the
 *   latest state in its authoritative refs and the load handler performs the
 *   complete latest-state pass;
 * - structural readiness established but required sources missing: recreate
 *   the missing sources/layers even when `isStyleLoaded()` is transiently
 *   false, then write the latest data;
 * - sources exist: always write the latest trip, speeding-route, and event
 *   data plus the camera for that same latest state, even when
 *   `isStyleLoaded()` is false.
 *
 * A `"synced"` pass is the single point where required structure exists, all
 * latest source data is written, the camera for that exact latest input is
 * applied, and resize happens.
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
  options: TripMapSyncOptions,
): TripMapSyncStatus {
  if (!map) return "no-map";
  if (!options.structuralReady) return "pending";
  if (!tripMapSourcesExist(map)) {
    ensureTripMapLayers(map, input.model);
    ensureTripSpeedingRouteLayer(map, input.speedingRoute);
    ensureTripEventLayer(map, input.eventPosition);
  }
  updateTripMapData(map, input.model);
  updateTripSpeedingRouteData(map, input.speedingRoute);
  updateTripEventData(map, input.eventPosition);
  options.applyCamera(map);
  map.resize();
  return "synced";
}

