import { fetchRecentDurableRunsResponse } from "@/lib/position-history-durable-runs/position-history-durable-run-client";
import { createDurableRunReadRouteHandler } from "@/lib/position-history-durable-runs/position-history-durable-run-route-handler";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const GET = createDurableRunReadRouteHandler(fetchRecentDurableRunsResponse, "recent");
