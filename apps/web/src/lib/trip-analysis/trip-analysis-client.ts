import "server-only";
import { parseWebConfig } from "../web-config";
import type { VehicleTrackRange } from "../vehicle-track/vehicle-track-range";
import { parseTripAnalysisResponse, TripAnalysisContractError, type TripAnalysisResponse } from "./trip-analysis-contract";
import { TripAnalysisBackendBadRequestError, TripAnalysisBackendNotFoundError, TripAnalysisBackendUnavailableError } from "./trip-analysis-errors";
import { tripAnalysisRequestInit, tripAnalysisRequestUrl } from "./trip-analysis-request";
import { authenticatedApiFetch } from "@/lib/auth/auth-cookie";

export async function fetchTripAnalysis(vehicleId: string, range: VehicleTrackRange, fetcher: typeof fetch = authenticatedApiFetch): Promise<TripAnalysisResponse> {
  const config = parseWebConfig(process.env); const url = tripAnalysisRequestUrl(config.apiInternalBaseUrl, vehicleId, range);
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(url, tripAnalysisRequestInit(controller.signal));
    if (response.status === 400) throw new TripAnalysisBackendBadRequestError();
    if (response.status === 404) throw new TripAnalysisBackendNotFoundError();
    if (!response.ok) throw new TripAnalysisBackendUnavailableError();
    let body: unknown; try { body = await response.json(); } catch { throw new TripAnalysisContractError(); }
    return parseTripAnalysisResponse(body);
  } catch (error) {
    if (error instanceof TripAnalysisContractError || error instanceof TripAnalysisBackendBadRequestError || error instanceof TripAnalysisBackendNotFoundError || error instanceof TripAnalysisBackendUnavailableError) throw error;
    throw new TripAnalysisBackendUnavailableError();
  } finally { clearTimeout(timeout); }
}
