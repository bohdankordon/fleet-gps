import "server-only";
import { authenticatedApiFetch } from "../auth/auth-cookie";
import { parseWebConfig } from "../web-config";
import { positionHistoryRetentionPlanSchema, type PositionHistoryRetentionPlan } from "./position-history-retention-contract";

function endpoint(): string { return `${parseWebConfig(process.env).apiInternalBaseUrl}/api/system/position-history/retention-plan`; }

export function fetchPositionHistoryRetentionPlanResponse(): Promise<Response> {
  return authenticatedApiFetch(endpoint(), { cache: "no-store", headers: { Accept: "application/json" } });
}

export async function fetchPositionHistoryRetentionPlan(fetcher: typeof fetch = authenticatedApiFetch): Promise<PositionHistoryRetentionPlan> {
  const response = await fetcher(endpoint(), { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("retention plan unavailable");
  return positionHistoryRetentionPlanSchema.parse(await response.json());
}
