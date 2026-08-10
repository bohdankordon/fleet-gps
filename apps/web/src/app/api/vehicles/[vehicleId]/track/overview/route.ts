import { fetchVehicleTrackOverview } from "@/lib/vehicle-track/vehicle-track-overview-client";
import { createVehicleTrackOverviewRouteHandler } from "@/lib/vehicle-track/vehicle-track-overview-route-handler";
export const dynamic = "force-dynamic";
export const GET = createVehicleTrackOverviewRouteHandler(fetchVehicleTrackOverview);
