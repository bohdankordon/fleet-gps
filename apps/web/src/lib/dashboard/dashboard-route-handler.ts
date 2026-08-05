import { DashboardBackendBadRequestError } from "./dashboard-errors";
import { DashboardContractError, type DashboardVehiclesResponse } from "./dashboard-contract";
import { DashboardQueryError, parseDashboardQuery } from "./dashboard-query";

export type DashboardFetcher = (query: ReturnType<typeof parseDashboardQuery>) => Promise<DashboardVehiclesResponse>;
export function createDashboardRouteHandler(fetchDashboard: DashboardFetcher) {
  return async (request: Request): Promise<Response> => {
    try {
      const query = parseDashboardQuery(new URL(request.url).searchParams);
      const data = await fetchDashboard(query);
      return Response.json(data, { status: 200 });
    } catch (error) {
      if (error instanceof DashboardQueryError || error instanceof DashboardBackendBadRequestError) return Response.json({ statusCode: 400, error: "Bad Request" }, { status: 400 });
      if (error instanceof DashboardContractError) return Response.json({ statusCode: 502, error: "Bad Gateway" }, { status: 502 });
      return Response.json({ statusCode: 503, error: "Service Unavailable" }, { status: 503 });
    }
  };
}
