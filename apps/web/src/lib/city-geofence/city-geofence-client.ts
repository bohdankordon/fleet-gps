import "server-only";

import { parseWebConfig } from "@/lib/web-config";
import { CityGeofenceContractError, parseCityGeofenceMapResponse, type CityGeofenceMapResponse } from "./city-geofence-contract";
import { CityGeofenceBackendUnavailableError } from "./city-geofence-errors";
import { authenticatedApiFetch } from "@/lib/auth/auth-cookie";

export async function fetchCityGeofenceMap(fetcher: typeof fetch = authenticatedApiFetch): Promise<CityGeofenceMapResponse> {
  const config = parseWebConfig(process.env);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(`${config.apiInternalBaseUrl}/api/system/city-geofence/map`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new CityGeofenceBackendUnavailableError();
    let body: unknown;
    try { body = await response.json(); } catch { throw new CityGeofenceContractError(); }
    return parseCityGeofenceMapResponse(body);
  } catch (error) {
    if (error instanceof CityGeofenceContractError || error instanceof CityGeofenceBackendUnavailableError) throw error;
    throw new CityGeofenceBackendUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}
