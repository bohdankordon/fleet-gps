import { rejectCrossOriginWrite } from "../auth/same-origin";
import { activeDurableRunSchema, createDurableRunRequestSchema, recentDurableRunsSchema, safeDurableRunSchema, type CreateDurableRunRequest } from "./position-history-durable-run-contract";
import { boundedBodyStatus, readBoundedJson } from "../http/bounded-body";

const headers = { "Cache-Control": "no-store" };
function safeError(status: number): Response {
  if (status === 409) return Response.json({ statusCode: 409, error: "HISTORY_DURABLE_POPULATION_ALREADY_RUNNING", message: "Фоновое дозаполнение уже запущено." }, { status, headers });
  const safeStatus = status === 400 || status === 401 || status === 403 ? status : 503;
  return Response.json({ statusCode: safeStatus, error: safeStatus === 400 ? "Bad Request" : safeStatus === 401 ? "Unauthorized" : safeStatus === 403 ? "Forbidden" : "Service Unavailable" }, { status: safeStatus, headers });
}

export function createDurableRunRouteHandler(execute: (request: CreateDurableRunRequest) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const rejected = rejectCrossOriginWrite(request);
    if (rejected) return rejected;
    let parsed: ReturnType<typeof createDurableRunRequestSchema.safeParse>;
    try { parsed = createDurableRunRequestSchema.safeParse(await readBoundedJson(request)); } catch (error) { const status = boundedBodyStatus(error); return status === 413 ? Response.json({ statusCode: 413, error: "Payload Too Large" }, { status, headers }) : safeError(400); }
    if (!parsed.success) return safeError(400);
    let upstream: Response;
    try { upstream = await execute(parsed.data); } catch { return safeError(503); }
    if (!upstream.ok) return safeError(upstream.status);
    try {
      const run = safeDurableRunSchema.safeParse(await upstream.json());
      return run.success ? Response.json(run.data, { status: 201, headers }) : safeError(503);
    } catch { return safeError(503); }
  };
}

export function createDurableRunReadRouteHandler(load: () => Promise<Response>, kind: "active" | "recent") {
  return async (): Promise<Response> => {
    try {
      const upstream = await load();
      if (!upstream.ok) return safeError(upstream.status);
      const parsed = (kind === "active" ? activeDurableRunSchema : recentDurableRunsSchema).safeParse(await upstream.json());
      return parsed.success ? Response.json(parsed.data, { headers }) : safeError(503);
    } catch { return safeError(503); }
  };
}
