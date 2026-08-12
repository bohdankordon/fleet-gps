import { parseVehicleTrackRange, type VehicleTrackRange } from "../vehicle-track/vehicle-track-range";
import { isTripAnalysisVehicleId, TripAnalysisContractError, type TripAnalysisResponse } from "./trip-analysis-contract";
import { TripAnalysisBackendBadRequestError, TripAnalysisBackendNotFoundError } from "./trip-analysis-errors";

type Fetcher = (vehicleId: string, range: VehicleTrackRange) => Promise<TripAnalysisResponse>;
function safe(status: 400 | 404 | 502 | 503): Response { return Response.json({ statusCode: status, error: status === 400 ? "Bad Request" : status === 404 ? "Not Found" : status === 502 ? "Bad Gateway" : "Service Unavailable" }, { status }); }
export function createTripAnalysisRouteHandler(fetchAnalysis: Fetcher) {
  return async (request: Request, context: { params: Promise<{ vehicleId: string }> }): Promise<Response> => {
    const { vehicleId } = await context.params; const url = new URL(request.url);
    if (!isTripAnalysisVehicleId(vehicleId) || [...url.searchParams.keys()].some((key) => key !== "from" && key !== "to") || url.searchParams.getAll("from").length !== 1 || url.searchParams.getAll("to").length !== 1) return safe(400);
    const range = parseVehicleTrackRange(url.searchParams.get("from"), url.searchParams.get("to")); if (!range) return safe(400);
    try { return Response.json(await fetchAnalysis(vehicleId, range), { status: 200, headers: { "Cache-Control": "no-store" } }); }
    catch (error) { if (error instanceof TripAnalysisBackendBadRequestError) return safe(400); if (error instanceof TripAnalysisBackendNotFoundError) return safe(404); if (error instanceof TripAnalysisContractError) return safe(502); return safe(503); }
  };
}

