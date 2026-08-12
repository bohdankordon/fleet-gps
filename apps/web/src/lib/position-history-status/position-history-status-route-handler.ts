import { parseVehicleTrackTimestamp } from "../vehicle-track/vehicle-track-range";
import { PositionHistoryStatusContractError, type PositionHistoryStatusResponse } from "./position-history-status-contract";
import { PositionHistoryStatusBadRequestError, PositionHistoryStatusUnavailableError } from "./position-history-status-errors";

type Fetcher = (to: string) => Promise<PositionHistoryStatusResponse>;
function safe(status: 400 | 502 | 503): Response { return Response.json({ statusCode: status, error: status === 400 ? "Bad Request" : status === 502 ? "Bad Gateway" : "Service Unavailable" }, { status, headers: { "Cache-Control": "no-store" } }); }

export function createPositionHistoryStatusRouteHandler(fetchStatus: Fetcher) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const keys = [...url.searchParams.keys()];
    const values = url.searchParams.getAll("to");
    if (keys.some((key) => key !== "to") || values.length !== 1 || !parseVehicleTrackTimestamp(values[0])) return safe(400);
    try { return Response.json(await fetchStatus(values[0]!), { headers: { "Cache-Control": "no-store" } }); }
    catch (error) {
      if (error instanceof PositionHistoryStatusBadRequestError) return safe(400);
      if (error instanceof PositionHistoryStatusContractError) return safe(502);
      if (error instanceof PositionHistoryStatusUnavailableError) return safe(503);
      return safe(503);
    }
  };
}
