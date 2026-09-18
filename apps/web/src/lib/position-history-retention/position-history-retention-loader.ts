import { positionHistoryRetentionPlanSchema, type PositionHistoryRetentionPlan } from "./position-history-retention-contract";

export async function loadPositionHistoryRetentionPlan(endpoint: string, fetcher: typeof fetch): Promise<PositionHistoryRetentionPlan> {
  const response = await fetcher(endpoint, { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("retention plan unavailable");
  return positionHistoryRetentionPlanSchema.parse(await response.json());
}
