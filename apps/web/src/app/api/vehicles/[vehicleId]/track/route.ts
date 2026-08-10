import { fetchVehicleTrack } from "@/lib/vehicle-track/vehicle-track-client";
import { createVehicleTrackRouteHandler } from "@/lib/vehicle-track/vehicle-track-route-handler";
export const dynamic = "force-dynamic";
export const GET = createVehicleTrackRouteHandler(fetchVehicleTrack);
