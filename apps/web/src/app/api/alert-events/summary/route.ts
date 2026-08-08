import { fetchAlertEventsSummary } from "@/lib/alert-events/alert-events-client";
import { createAlertEventsSummaryRouteHandler } from "@/lib/alert-events/alert-events-route-handler";
export const dynamic = "force-dynamic";
export const GET = createAlertEventsSummaryRouteHandler(fetchAlertEventsSummary);
