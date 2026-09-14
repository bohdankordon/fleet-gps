import { fetchPositionHistoryIngestionStatus } from "@/lib/position-history-ingestion-status/position-history-ingestion-status-client";
import { createPositionHistoryIngestionStatusRouteHandler } from "@/lib/position-history-ingestion-status/position-history-ingestion-status-route-handler";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const GET = createPositionHistoryIngestionStatusRouteHandler(fetchPositionHistoryIngestionStatus);
