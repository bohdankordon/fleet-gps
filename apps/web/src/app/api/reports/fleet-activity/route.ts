import { fetchFleetActivityReport } from "@/lib/fleet-activity-report/fleet-activity-report-client";
import { createFleetActivityReportRouteHandler } from "@/lib/fleet-activity-report/fleet-activity-report-route-handler";
export const dynamic = "force-dynamic"; export const revalidate = 0; export const GET = createFleetActivityReportRouteHandler(fetchFleetActivityReport);
