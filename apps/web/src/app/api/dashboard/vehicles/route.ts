import { fetchDashboardVehicles } from "@/lib/dashboard/dashboard-client";
import { createDashboardRouteHandler } from "@/lib/dashboard/dashboard-route-handler";

export const dynamic = "force-dynamic";
export const GET = createDashboardRouteHandler(fetchDashboardVehicles);
