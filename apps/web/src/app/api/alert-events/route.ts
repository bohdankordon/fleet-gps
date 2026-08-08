import { fetchAlertEvents } from "@/lib/alert-events/alert-events-client";
import { createAlertEventsRouteHandler } from "@/lib/alert-events/alert-events-route-handler";
export const dynamic = "force-dynamic";
export const GET = createAlertEventsRouteHandler(fetchAlertEvents);
