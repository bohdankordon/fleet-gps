import { AlertEventsContractError, type AlertEventsListResponse, type AlertEventsSummaryResponse } from "./alert-events-contract";
import { AlertEventsBackendBadRequestError } from "./alert-events-errors";
import { AlertEventsQueryError, parseAlertEventsRequestQuery } from "./alert-events-query";

export type AlertEventsFetcher = (query: ReturnType<typeof parseAlertEventsRequestQuery>) => Promise<AlertEventsListResponse>;
export type AlertEventsSummaryFetcher = () => Promise<AlertEventsSummaryResponse>;
function safeError(status: 400 | 502 | 503): Response { return Response.json({ statusCode: status, error: status === 400 ? "Bad Request" : status === 502 ? "Bad Gateway" : "Service Unavailable" }, { status }); }
export function createAlertEventsRouteHandler(fetchAlertEvents: AlertEventsFetcher) { return async (request: Request): Promise<Response> => { try { return Response.json(await fetchAlertEvents(parseAlertEventsRequestQuery(new URL(request.url).searchParams)), { status: 200 }); } catch (error) { if (error instanceof AlertEventsQueryError || error instanceof AlertEventsBackendBadRequestError) return safeError(400); if (error instanceof AlertEventsContractError) return safeError(502); return safeError(503); } }; }
export function createAlertEventsSummaryRouteHandler(fetchSummary: AlertEventsSummaryFetcher) { return async (): Promise<Response> => { try { return Response.json(await fetchSummary(), { status: 200 }); } catch (error) { if (error instanceof AlertEventsContractError) return safeError(502); return safeError(503); } }; }
