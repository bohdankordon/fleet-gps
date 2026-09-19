import { fetchPositionHistoryHorizonPlan } from "@/lib/position-history-horizon-plan/position-history-horizon-plan-client";
import { createPositionHistoryHorizonPlanRouteHandler } from "@/lib/position-history-horizon-plan/position-history-horizon-plan-route-handler";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const GET = createPositionHistoryHorizonPlanRouteHandler(fetchPositionHistoryHorizonPlan);
