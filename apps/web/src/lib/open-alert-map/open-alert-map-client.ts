import "server-only";

import { parseWebConfig } from "@/lib/web-config";
import { OpenAlertMapContractError, parseOpenAlertMapResponse, type OpenAlertMapResponse } from "./open-alert-map-contract";
import { OpenAlertMapBackendUnavailableError } from "./open-alert-map-errors";
import { authenticatedApiFetch } from "@/lib/auth/auth-cookie";

export async function fetchOpenAlertMap(fetcher: typeof fetch = authenticatedApiFetch): Promise<OpenAlertMapResponse> {
  const config = parseWebConfig(process.env);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(`${config.apiInternalBaseUrl}/api/alert-events/map`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new OpenAlertMapBackendUnavailableError();
    let body: unknown;
    try { body = await response.json(); } catch { throw new OpenAlertMapContractError(); }
    return parseOpenAlertMapResponse(body);
  } catch (error) {
    if (error instanceof OpenAlertMapContractError || error instanceof OpenAlertMapBackendUnavailableError) throw error;
    throw new OpenAlertMapBackendUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}
