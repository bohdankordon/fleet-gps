import { PositionHistoryIngestionStatusContractError, type PositionHistoryIngestionStatusResponse } from "./position-history-ingestion-status-contract";
import { PositionHistoryIngestionStatusForbiddenError, PositionHistoryIngestionStatusUnauthorizedError, PositionHistoryIngestionStatusUnavailableError } from "./position-history-ingestion-status-errors";

type Fetcher = () => Promise<PositionHistoryIngestionStatusResponse>;

function safe(status: 400 | 401 | 403 | 502 | 503): Response {
  const error = status === 400 ? "Bad Request" : status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : status === 502 ? "Bad Gateway" : "Service Unavailable";
  return Response.json({ statusCode: status, error }, { status, headers: { "Cache-Control": "no-store" } });
}

export function createPositionHistoryIngestionStatusRouteHandler(fetchStatus: Fetcher) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].length > 0) return safe(400);
    try {
      return Response.json(await fetchStatus(), { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (error instanceof PositionHistoryIngestionStatusUnauthorizedError) return safe(401);
      if (error instanceof PositionHistoryIngestionStatusForbiddenError) return safe(403);
      if (error instanceof PositionHistoryIngestionStatusContractError) return safe(502);
      if (error instanceof PositionHistoryIngestionStatusUnavailableError) return safe(503);
      return safe(503);
    }
  };
}
