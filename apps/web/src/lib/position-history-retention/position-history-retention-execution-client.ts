import "server-only";
import { authenticatedApiFetch } from "../auth/auth-cookie";
import { parseWebConfig } from "../web-config";
import type { PositionHistoryRetentionExecutionRequest } from "./position-history-retention-contract";

export function executePositionHistoryRetention(request: PositionHistoryRetentionExecutionRequest): Promise<Response> {
  return authenticatedApiFetch(`${parseWebConfig(process.env).apiInternalBaseUrl}/api/system/position-history/retention-execute`, {
    method: "POST",
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}
