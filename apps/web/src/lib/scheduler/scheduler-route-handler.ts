import { SchedulerBackendUnavailableError } from "./scheduler-errors";
import { SchedulerContractError, type SchedulerStatusResponse } from "./scheduler-contract";

export type SchedulerFetcher = () => Promise<SchedulerStatusResponse>;

export function createSchedulerRouteHandler(fetchScheduler: SchedulerFetcher) {
  return async (): Promise<Response> => {
    try { return Response.json(await fetchScheduler(), { status: 200 }); }
    catch (error) {
      if (error instanceof SchedulerBackendUnavailableError) return Response.json({ statusCode: 503, error: "Service Unavailable" }, { status: 503 });
      if (error instanceof SchedulerContractError) return Response.json({ statusCode: 502, error: "Bad Gateway" }, { status: 502 });
      return Response.json({ statusCode: 500, error: "Internal Server Error" }, { status: 500 });
    }
  };
}
