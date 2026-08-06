import "server-only";
import { parseWebConfig } from "@/lib/web-config";
import { SchedulerContractError, parseSchedulerStatusResponse, type SchedulerStatusResponse } from "./scheduler-contract";
import { SchedulerBackendUnavailableError } from "./scheduler-errors";

export async function fetchSchedulerStatus(fetcher: typeof fetch = fetch): Promise<SchedulerStatusResponse> {
  const config = parseWebConfig(process.env);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(`${config.apiInternalBaseUrl}/api/system/sync-status`, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new SchedulerBackendUnavailableError();
    let body: unknown;
    try { body = await response.json(); } catch { throw new SchedulerContractError(); }
    return parseSchedulerStatusResponse(body);
  } catch (error) {
    if (error instanceof SchedulerContractError || error instanceof SchedulerBackendUnavailableError) throw error;
    throw new SchedulerBackendUnavailableError();
  } finally { clearTimeout(timeout); }
}
