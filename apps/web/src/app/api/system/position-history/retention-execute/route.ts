import { executePositionHistoryRetention } from "@/lib/position-history-retention/position-history-retention-execution-client";
import { createPositionHistoryRetentionExecutionRouteHandler } from "@/lib/position-history-retention/position-history-retention-execution-route-handler";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const POST = createPositionHistoryRetentionExecutionRouteHandler(executePositionHistoryRetention);
