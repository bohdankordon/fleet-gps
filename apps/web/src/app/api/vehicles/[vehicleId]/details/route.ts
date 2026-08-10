import { fetchVehicleDetails } from "@/lib/vehicle-details/vehicle-details-client";
import { createVehicleDetailsRouteHandler } from "@/lib/vehicle-details/vehicle-details-route-handler";
export const dynamic = "force-dynamic";
export const GET = createVehicleDetailsRouteHandler(fetchVehicleDetails);
