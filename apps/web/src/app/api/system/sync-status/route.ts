import { fetchSchedulerStatus } from "@/lib/scheduler/scheduler-client";
import { createSchedulerRouteHandler } from "@/lib/scheduler/scheduler-route-handler";

export const dynamic = "force-dynamic";
export const GET = createSchedulerRouteHandler(fetchSchedulerStatus);
