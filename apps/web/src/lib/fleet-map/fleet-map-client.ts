import "server-only";
import { parseWebConfig } from "@/lib/web-config";
import { FleetMapContractError, parseFleetMapResponse, type FleetMapResponse } from "./fleet-map-contract";
import { FleetMapBackendUnavailableError } from "./fleet-map-errors";

export async function fetchFleetMapSnapshot(fetcher: typeof fetch = fetch): Promise<FleetMapResponse> {
  const config = parseWebConfig(process.env); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(`${config.apiInternalBaseUrl}/api/fleet/map`, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new FleetMapBackendUnavailableError();
    let body: unknown; try { body = await response.json(); } catch { throw new FleetMapContractError(); }
    return parseFleetMapResponse(body);
  } catch (error) {
    if (error instanceof FleetMapContractError || error instanceof FleetMapBackendUnavailableError) throw error;
    throw new FleetMapBackendUnavailableError();
  } finally { clearTimeout(timeout); }
}
