import "server-only";
import { parseWebConfig } from "@/lib/web-config";
import { AlertEventsContractError, parseAlertEventsListResponse, parseAlertEventsSummaryResponse, type AlertEventsListResponse, type AlertEventsSummaryResponse } from "./alert-events-contract";
import { AlertEventsBackendBadRequestError, AlertEventsBackendUnavailableError } from "./alert-events-errors";
import { serializeAlertEventsRequestQuery, type AlertEventsFilters, type AlertEventsRequestQuery } from "./alert-events-query";

async function backendJson(path: string, fetcher: typeof fetch): Promise<unknown> {
  const config = parseWebConfig(process.env); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(`${config.apiInternalBaseUrl}${path}`, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
    if (response.status === 400) throw new AlertEventsBackendBadRequestError();
    if (!response.ok) throw new AlertEventsBackendUnavailableError();
    try { return await response.json(); } catch { throw new AlertEventsContractError(); }
  } catch (error) {
    if (error instanceof AlertEventsBackendBadRequestError || error instanceof AlertEventsBackendUnavailableError || error instanceof AlertEventsContractError) throw error;
    throw new AlertEventsBackendUnavailableError();
  } finally { clearTimeout(timeout); }
}

export async function fetchAlertEvents(query: AlertEventsRequestQuery, fetcher: typeof fetch = fetch): Promise<AlertEventsListResponse> { return parseAlertEventsListResponse(await backendJson(`/api/alert-events?${serializeAlertEventsRequestQuery(query)}`, fetcher)); }
export async function fetchAlertEventsSummary(fetcher: typeof fetch = fetch): Promise<AlertEventsSummaryResponse> { return parseAlertEventsSummaryResponse(await backendJson("/api/alert-events/summary", fetcher)); }
export function firstAlertEventsQuery(filters: AlertEventsFilters): AlertEventsRequestQuery { return Object.freeze({ ...filters, limit: 25 }); }
