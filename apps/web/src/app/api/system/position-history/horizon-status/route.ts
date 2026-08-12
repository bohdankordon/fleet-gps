import { fetchPositionHistoryStatus } from "@/lib/position-history-status/position-history-status-client";
import { createPositionHistoryStatusRouteHandler } from "@/lib/position-history-status/position-history-status-route-handler";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const GET = createPositionHistoryStatusRouteHandler(fetchPositionHistoryStatus);
