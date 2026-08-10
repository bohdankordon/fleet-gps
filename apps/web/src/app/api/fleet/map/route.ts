import { fetchFleetMapSnapshot } from "@/lib/fleet-map/fleet-map-client";
import { createFleetMapRouteHandler } from "@/lib/fleet-map/fleet-map-route-handler";

export const dynamic = "force-dynamic";
export const GET = createFleetMapRouteHandler(fetchFleetMapSnapshot);
