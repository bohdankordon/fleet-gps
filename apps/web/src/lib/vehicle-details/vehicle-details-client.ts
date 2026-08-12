import "server-only";
import { parseWebConfig } from "@/lib/web-config";
import { VehicleDetailsContractError, parseVehicleDetailsResponse, type VehicleDetailsResponse } from "./vehicle-details-contract";
import { VehicleDetailsBackendBadRequestError, VehicleDetailsBackendNotFoundError, VehicleDetailsBackendUnavailableError } from "./vehicle-details-errors";
import { authenticatedApiFetch } from "@/lib/auth/auth-cookie";

export async function fetchVehicleDetails(vehicleId: string, fetcher: typeof fetch = authenticatedApiFetch): Promise<VehicleDetailsResponse> {
  const config = parseWebConfig(process.env); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(`${config.apiInternalBaseUrl}/api/vehicles/${vehicleId}/details`, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
    if (response.status === 400) throw new VehicleDetailsBackendBadRequestError();
    if (response.status === 404) throw new VehicleDetailsBackendNotFoundError();
    if (!response.ok) throw new VehicleDetailsBackendUnavailableError();
    try { return parseVehicleDetailsResponse(await response.json()); } catch (error) { if (error instanceof VehicleDetailsContractError) throw error; throw new VehicleDetailsContractError(); }
  } catch (error) {
    if (error instanceof VehicleDetailsContractError || error instanceof VehicleDetailsBackendBadRequestError || error instanceof VehicleDetailsBackendNotFoundError || error instanceof VehicleDetailsBackendUnavailableError) throw error;
    throw new VehicleDetailsBackendUnavailableError();
  } finally { clearTimeout(timeout); }
}
