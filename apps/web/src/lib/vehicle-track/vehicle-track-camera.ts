import type { CityGeofenceMapResponse } from "../city-geofence/city-geofence-contract";
import { cityGeofenceBounds } from "../city-geofence/city-geofence-map";
import { VINNYTSIA_FALLBACK_CAMERA, type FleetMapCamera } from "../fleet-map/fleet-map-camera";
import type { VehicleTrackPresentationModel } from "./vehicle-track-presentation";

export function vehicleTrackCamera(model: VehicleTrackPresentationModel, geofence: CityGeofenceMapResponse | null): FleetMapCamera {
  if (model.points.length === 0) { const bounds = cityGeofenceBounds(geofence); return bounds ? { bounds, padding: 56, maxZoom: 13 } : VINNYTSIA_FALLBACK_CAMERA; }
  if (model.points.length === 1) return { center: [model.points[0]!.point.longitude, model.points[0]!.point.latitude], zoom: 14 };
  return { bounds: model.bounds!, padding: 56, maxZoom: 15 };
}
export function shouldFitVehicleTrackCamera(initialCameraApplied: boolean, rangeChanged: boolean): boolean { return !initialCameraApplied || rangeChanged; }
