import { parseVehicleTrackTimestamp } from "../vehicle-track/vehicle-track-range";
import { PositionHistoryHorizonPlanContractError, type PositionHistoryHorizonPlanResponse } from "./position-history-horizon-plan-contract";
import { PositionHistoryHorizonPlanBadRequestError, PositionHistoryHorizonPlanUnavailableError } from "./position-history-horizon-plan-errors";

type Fetcher = (to: string) => Promise<PositionHistoryHorizonPlanResponse>;

function safe(status: 400 | 502 | 503): Response {
  const error = status === 400 ? "Bad Request" : status === 502 ? "Bad Gateway" : "Service Unavailable";
  return Response.json({ statusCode: status, error }, { status, headers: { "Cache-Control": "no-store" } });
}

export function createPositionHistoryHorizonPlanRouteHandler(fetchPlan: Fetcher) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const keys = [...url.searchParams.keys()];
    const values = url.searchParams.getAll("to");
    if (keys.some((key) => key !== "to") || values.length !== 1 || !parseVehicleTrackTimestamp(values[0])) return safe(400);
    try { return Response.json(await fetchPlan(values[0]!), { headers: { "Cache-Control": "no-store" } }); }
    catch (error) {
      if (error instanceof PositionHistoryHorizonPlanBadRequestError) return safe(400);
      if (error instanceof PositionHistoryHorizonPlanContractError) return safe(502);
      if (error instanceof PositionHistoryHorizonPlanUnavailableError) return safe(503);
      return safe(503);
    }
  };
}
