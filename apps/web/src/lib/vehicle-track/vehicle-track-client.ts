import "server-only";
import { parseWebConfig } from "@/lib/web-config";
import { parseVehicleTrackResponse, VehicleTrackContractError, type VehicleTrackResponse } from "./vehicle-track-contract";
import { VehicleTrackBackendBadRequestError, VehicleTrackBackendNotFoundError, VehicleTrackBackendTooDenseError, VehicleTrackBackendUnavailableError } from "./vehicle-track-errors";
import type { VehicleTrackRange } from "./vehicle-track-range";

export async function fetchVehicleTrack(vehicleId: string, range: VehicleTrackRange, fetcher: typeof fetch = fetch): Promise<VehicleTrackResponse> {
  const config = parseWebConfig(process.env); const url = new URL(`${config.apiInternalBaseUrl}/api/vehicles/${vehicleId}/track`);
  url.searchParams.set("from", range.from); url.searchParams.set("to", range.to);
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(url, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
    if (response.status === 400) throw new VehicleTrackBackendBadRequestError();
    if (response.status === 404) throw new VehicleTrackBackendNotFoundError();
    if (response.status === 422) throw new VehicleTrackBackendTooDenseError();
    if (!response.ok) throw new VehicleTrackBackendUnavailableError();
    let body: unknown; try { body = await response.json(); } catch { throw new VehicleTrackContractError(); }
    return parseVehicleTrackResponse(body);
  } catch (error) {
    if (error instanceof VehicleTrackContractError || error instanceof VehicleTrackBackendBadRequestError || error instanceof VehicleTrackBackendNotFoundError || error instanceof VehicleTrackBackendTooDenseError || error instanceof VehicleTrackBackendUnavailableError) throw error;
    throw new VehicleTrackBackendUnavailableError();
  } finally { clearTimeout(timeout); }
}
