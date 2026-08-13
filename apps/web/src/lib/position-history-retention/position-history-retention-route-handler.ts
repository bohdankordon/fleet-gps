import { positionHistoryRetentionPlanSchema } from "./position-history-retention-contract";

const headers = { "Cache-Control": "no-store" };
function safeError(status: number): Response {
  const safeStatus = status === 401 || status === 403 ? status : 503;
  return Response.json({ statusCode: safeStatus, error: safeStatus === 401 ? "Unauthorized" : safeStatus === 403 ? "Forbidden" : "Service Unavailable" }, { status: safeStatus, headers });
}

export function createPositionHistoryRetentionRouteHandler(load: () => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    if (new URL(request.url).search.length > 0) return Response.json({ statusCode: 400, error: "Bad Request" }, { status: 400, headers });
    try {
      const upstream = await load();
      if (!upstream.ok) return safeError(upstream.status);
      const parsed = positionHistoryRetentionPlanSchema.safeParse(await upstream.json());
      return parsed.success ? Response.json(parsed.data, { headers }) : safeError(503);
    } catch { return safeError(503); }
  };
}
