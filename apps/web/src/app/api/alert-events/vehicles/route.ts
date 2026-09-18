import { fetchAlertEventsFilterOptions } from "@/lib/alert-events/alert-events-client";
import { createAlertEventsFilterOptionsRouteHandler } from "@/lib/alert-events/alert-events-route-handler";
export const dynamic = "force-dynamic";
export const GET = createAlertEventsFilterOptionsRouteHandler(fetchAlertEventsFilterOptions);
