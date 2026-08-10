import { isVehicleTrackId } from "./vehicle-track-contract";
import { VehicleTrackBackendBadRequestError, VehicleTrackBackendNotFoundError, VehicleTrackBackendTooDenseError } from "./vehicle-track-errors";
import { VehicleTrackOverviewContractError, type VehicleTrackOverviewResponse } from "./vehicle-track-overview-contract";
import { parseVehicleTrackRange, type VehicleTrackRange } from "./vehicle-track-range";

type Fetcher = (vehicleId: string, range: VehicleTrackRange) => Promise<VehicleTrackOverviewResponse>;
function safe(status: 400 | 404 | 422 | 502 | 503): Response { return Response.json({ statusCode: status, error: status === 400 ? "Bad Request" : status === 404 ? "Not Found" : status === 422 ? "Unprocessable Entity" : status === 502 ? "Bad Gateway" : "Service Unavailable" }, { status }); }

export function createVehicleTrackOverviewRouteHandler(fetchOverview: Fetcher) {
  return async (request: Request, context: { params: Promise<{ vehicleId: string }> }): Promise<Response> => {
    const { vehicleId } = await context.params; const url = new URL(request.url);
    if (!isVehicleTrackId(vehicleId) || [...url.searchParams.keys()].some((key) => key !== "from" && key !== "to") || url.searchParams.getAll("from").length !== 1 || url.searchParams.getAll("to").length !== 1) return safe(400);
    const range = parseVehicleTrackRange(url.searchParams.get("from"), url.searchParams.get("to"));
    if (!range) return safe(400);
    try { return Response.json(await fetchOverview(vehicleId, range), { status: 200 }); }
    catch (error) {
      if (error instanceof VehicleTrackBackendBadRequestError) return safe(400);
      if (error instanceof VehicleTrackBackendNotFoundError) return safe(404);
      if (error instanceof VehicleTrackBackendTooDenseError) return safe(422);
      if (error instanceof VehicleTrackOverviewContractError) return safe(502);
      return safe(503);
    }
  };
}
