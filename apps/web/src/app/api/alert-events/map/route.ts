import { fetchOpenAlertMap } from "@/lib/open-alert-map/open-alert-map-client";
import { createOpenAlertMapRouteHandler } from "@/lib/open-alert-map/open-alert-map-route-handler";

export const dynamic = "force-dynamic";
export const GET = createOpenAlertMapRouteHandler(fetchOpenAlertMap);
