import "server-only";
import { parseWebConfig } from "@/lib/web-config";
import { parseAlertEventsVehicleOptions, type AlertEventsVehicleOptions, AlertEventsContractError, parseAlertEventsListResponse, parseAlertEventsSummaryResponse, parseSpeedingEventInvestigation, type AlertEventsListResponse, type AlertEventsSummaryResponse, type SpeedingEventInvestigation } from "./alert-events-contract";
import { AlertEventInvestigationNotFoundError, AlertEventsBackendBadRequestError, AlertEventsBackendUnavailableError } from "./alert-events-errors";
import { serializeAlertEventsRequestQuery, type AlertEventsFilters, type AlertEventsRequestQuery } from "./alert-events-query";
import { authenticatedApiFetch } from "@/lib/auth/auth-cookie";

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

async function investigationJson(eventId: string, fetcher: typeof fetch): Promise<unknown> {
  const config = parseWebConfig(process.env); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(`${config.apiInternalBaseUrl}/api/alert-events/${encodeURIComponent(eventId)}/investigation`, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
    if (response.status === 404) throw new AlertEventInvestigationNotFoundError();
    if (!response.ok) throw new AlertEventsBackendUnavailableError();
    try { return await response.json(); } catch { throw new AlertEventsContractError(); }
  } catch (error) {
    if (error instanceof AlertEventInvestigationNotFoundError || error instanceof AlertEventsBackendUnavailableError || error instanceof AlertEventsContractError) throw error;
    throw new AlertEventsBackendUnavailableError();
  } finally { clearTimeout(timeout); }
}

export async function fetchAlertEvents(query: AlertEventsRequestQuery, fetcher: typeof fetch = authenticatedApiFetch): Promise<AlertEventsListResponse> { return parseAlertEventsListResponse(await backendJson(`/api/alert-events?${serializeAlertEventsRequestQuery(query)}`, fetcher)); }
export async function fetchAlertEventsSummary(fetcher: typeof fetch = authenticatedApiFetch): Promise<AlertEventsSummaryResponse> { return parseAlertEventsSummaryResponse(await backendJson("/api/alert-events/summary", fetcher)); }
export function firstAlertEventsQuery(filters: AlertEventsFilters): AlertEventsRequestQuery { return Object.freeze({ ...filters, limit: 25 }); }

export async function fetchAlertEventsVehicleOptions(fetcher: typeof fetch = authenticatedApiFetch): Promise<AlertEventsVehicleOptions> { return parseAlertEventsVehicleOptions(await backendJson("/api/alert-events/vehicles", fetcher)); }
export async function fetchSpeedingEventInvestigation(eventId: string, fetcher: typeof fetch = authenticatedApiFetch): Promise<SpeedingEventInvestigation> { return parseSpeedingEventInvestigation(await investigationJson(eventId, fetcher)); }
