import { fetchAlertEventsVehicleOptions } from "@/lib/alert-events/alert-events-client";
import { createAlertEventsVehicleOptionsRouteHandler } from "@/lib/alert-events/alert-events-route-handler";
export const dynamic = "force-dynamic";
export const GET = createAlertEventsVehicleOptionsRouteHandler(fetchAlertEventsVehicleOptions);
