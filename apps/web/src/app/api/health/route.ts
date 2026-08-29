import { fetchApiHealth } from "@/lib/health/health-client";
import { createHealthRouteHandler } from "@/lib/health/health-route-handler";

export const dynamic = "force-dynamic";
export const GET = createHealthRouteHandler("/api/health", fetchApiHealth);
