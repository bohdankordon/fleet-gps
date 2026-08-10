import type { FleetMapResponse } from "./fleet-map-contract";
import type { CityGeofenceMapResponse } from "../city-geofence/city-geofence-contract";
import { cityGeofenceBounds } from "../city-geofence/city-geofence-map";

export const VINNYTSIA_FALLBACK_CAMERA = Object.freeze({ center: [28.4682, 49.2331] as const, zoom: 11 });
export type FleetMapCamera = Readonly<{ center: readonly [number, number]; zoom: number }> | Readonly<{ bounds: readonly [readonly [number, number], readonly [number, number]]; padding: number; maxZoom: number }>;

export function fleetMapInitialCamera(snapshot: FleetMapResponse, geofence: CityGeofenceMapResponse | null = null): FleetMapCamera {
  const points = snapshot.vehicles.map((vehicle) => [vehicle.position.longitude, vehicle.position.latitude] as const);
  if (points.length === 0) {
    const bounds = cityGeofenceBounds(geofence);
    return bounds === null ? VINNYTSIA_FALLBACK_CAMERA : { bounds, padding: 56, maxZoom: 13 };
  }
  if (points.length === 1) return { center: points[0]!, zoom: 13 };
  const longitudes = points.map((point) => point[0]); const latitudes = points.map((point) => point[1]);
  return { bounds: [[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]], padding: 56, maxZoom: 14 };
}
