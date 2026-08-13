import { fetchPositionHistoryRetentionPlanResponse } from "@/lib/position-history-retention/position-history-retention-client";
import { createPositionHistoryRetentionRouteHandler } from "@/lib/position-history-retention/position-history-retention-route-handler";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const GET = createPositionHistoryRetentionRouteHandler(fetchPositionHistoryRetentionPlanResponse);
