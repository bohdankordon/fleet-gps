import { fetchTripAnalysis } from "@/lib/trip-analysis/trip-analysis-client";
import { createTripAnalysisRouteHandler } from "@/lib/trip-analysis/trip-analysis-route-handler";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const GET = createTripAnalysisRouteHandler(fetchTripAnalysis);

