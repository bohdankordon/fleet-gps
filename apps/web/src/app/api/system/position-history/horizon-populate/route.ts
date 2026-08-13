import { executePositionHistoryPopulation } from "@/lib/position-history-population/position-history-population-client";
import { createPositionHistoryPopulationRouteHandler } from "@/lib/position-history-population/position-history-population-route-handler";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const POST = createPositionHistoryPopulationRouteHandler(executePositionHistoryPopulation);
