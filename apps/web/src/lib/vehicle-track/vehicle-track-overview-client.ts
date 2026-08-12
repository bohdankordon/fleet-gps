import "server-only";
import { parseWebConfig } from "@/lib/web-config";
import { VehicleTrackBackendBadRequestError, VehicleTrackBackendNotFoundError, VehicleTrackBackendTooDenseError, VehicleTrackBackendUnavailableError } from "./vehicle-track-errors";
import { parseVehicleTrackOverviewResponse, VehicleTrackOverviewContractError, type VehicleTrackOverviewResponse } from "./vehicle-track-overview-contract";
import type { VehicleTrackRange } from "./vehicle-track-range";
import { authenticatedApiFetch } from "@/lib/auth/auth-cookie";

export async function fetchVehicleTrackOverview(vehicleId: string, range: VehicleTrackRange, fetcher: typeof fetch = authenticatedApiFetch): Promise<VehicleTrackOverviewResponse> {
  const config = parseWebConfig(process.env); const url = new URL(`${config.apiInternalBaseUrl}/api/vehicles/${vehicleId}/track/overview`);
  url.searchParams.set("from", range.from); url.searchParams.set("to", range.to);
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(url, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
    if (response.status === 400) throw new VehicleTrackBackendBadRequestError();
    if (response.status === 404) throw new VehicleTrackBackendNotFoundError();
    if (response.status === 422) throw new VehicleTrackBackendTooDenseError();
    if (!response.ok) throw new VehicleTrackBackendUnavailableError();
    let body: unknown; try { body = await response.json(); } catch { throw new VehicleTrackOverviewContractError(); }
    return parseVehicleTrackOverviewResponse(body);
  } catch (error) {
    if (error instanceof VehicleTrackOverviewContractError || error instanceof VehicleTrackBackendBadRequestError || error instanceof VehicleTrackBackendNotFoundError || error instanceof VehicleTrackBackendTooDenseError || error instanceof VehicleTrackBackendUnavailableError) throw error;
    throw new VehicleTrackBackendUnavailableError();
  } finally { clearTimeout(timeout); }
}
