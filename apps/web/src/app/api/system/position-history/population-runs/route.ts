import { createDurableRun } from "@/lib/position-history-durable-runs/position-history-durable-run-client";
import { createDurableRunRouteHandler } from "@/lib/position-history-durable-runs/position-history-durable-run-route-handler";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const POST = createDurableRunRouteHandler(createDurableRun);

