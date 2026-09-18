import "server-only";
import { authenticatedApiFetch } from "../auth/auth-cookie";
import { parseWebConfig } from "../web-config";
import type { PositionHistoryRetentionPlan } from "./position-history-retention-contract";
import { loadPositionHistoryRetentionPlan } from "./position-history-retention-loader";

function endpoint(): string { return `${parseWebConfig(process.env).apiInternalBaseUrl}/api/system/position-history/retention-plan`; }

export function fetchPositionHistoryRetentionPlanResponse(): Promise<Response> {
  return authenticatedApiFetch(endpoint(), { cache: "no-store", headers: { Accept: "application/json" } });
}

export async function fetchPositionHistoryRetentionPlan(fetcher: typeof fetch = authenticatedApiFetch): Promise<PositionHistoryRetentionPlan> {
  return loadPositionHistoryRetentionPlan(endpoint(), fetcher);
}
