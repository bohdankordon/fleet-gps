import "server-only";
import { parseWebConfig } from "@/lib/web-config";
import { DashboardContractError, parseDashboardVehiclesResponse, type DashboardVehiclesResponse } from "./dashboard-contract";
import { DashboardBackendBadRequestError, DashboardBackendUnavailableError } from "./dashboard-errors";
import { serializeDashboardQuery, type DashboardQuery } from "./dashboard-query";

export async function fetchDashboardVehicles(params: DashboardQuery, fetcher: typeof fetch = fetch): Promise<DashboardVehiclesResponse> {
  const config = parseWebConfig(process.env);
  const query = serializeDashboardQuery(params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(`${config.apiInternalBaseUrl}/api/dashboard/vehicles${query ? `?${query}` : ""}`, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
    if (response.status === 400) throw new DashboardBackendBadRequestError();
    if (!response.ok) throw new DashboardBackendUnavailableError();
    let body: unknown;
    try { body = await response.json(); } catch { throw new DashboardContractError(); }
    return parseDashboardVehiclesResponse(body);
  } catch (error) {
    if (error instanceof DashboardBackendBadRequestError || error instanceof DashboardBackendUnavailableError || error instanceof DashboardContractError) throw error;
    throw new DashboardBackendUnavailableError();
  } finally { clearTimeout(timeout); }
}
