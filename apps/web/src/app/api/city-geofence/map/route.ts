import { fetchCityGeofenceMap } from "@/lib/city-geofence/city-geofence-client";
import { createCityGeofenceRouteHandler } from "@/lib/city-geofence/city-geofence-route-handler";

export const dynamic = "force-dynamic";
export const GET = createCityGeofenceRouteHandler(fetchCityGeofenceMap);
