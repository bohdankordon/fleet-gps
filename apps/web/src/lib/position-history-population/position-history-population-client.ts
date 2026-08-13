import "server-only";
import { authenticatedApiFetch } from "../auth/auth-cookie";
import { parseWebConfig } from "../web-config";
import type { PositionHistoryPopulationRequest } from "./position-history-population-contract";

export function executePositionHistoryPopulation(request: PositionHistoryPopulationRequest): Promise<Response> {
  const config = parseWebConfig(process.env);
  return authenticatedApiFetch(`${config.apiInternalBaseUrl}/api/system/position-history/horizon-populate`, {
    method: "POST",
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}
