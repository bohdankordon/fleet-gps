import { CityGeofenceContractError, type CityGeofenceMapResponse } from "./city-geofence-contract";

export type CityGeofenceFetcher = () => Promise<CityGeofenceMapResponse>;

export function createCityGeofenceRouteHandler(fetchCityGeofence: CityGeofenceFetcher) {
  return async (): Promise<Response> => {
    try {
      return Response.json(await fetchCityGeofence(), { status: 200 });
    } catch (error) {
      if (error instanceof CityGeofenceContractError) {
        return Response.json({ statusCode: 502, error: "Bad Gateway" }, { status: 502 });
      }
      return Response.json({ statusCode: 503, error: "Service Unavailable" }, { status: 503 });
    }
  };
}
