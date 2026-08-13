import { rejectCrossOriginWrite } from "../auth/same-origin";
import { positionHistoryPopulationRequestSchema, positionHistoryPopulationResultSchema, type PositionHistoryPopulationRequest } from "./position-history-population-contract";

type Executor = (request: PositionHistoryPopulationRequest) => Promise<Response>;
const noStore = { "Cache-Control": "no-store" };
function error(status: 400 | 401 | 403 | 409 | 500 | 502 | 503): Response {
  if (status === 409) return Response.json({ statusCode: 409, error: "HISTORY_POPULATION_ALREADY_RUNNING", message: "Дозаполнение истории уже выполняется." }, { status, headers: noStore });
  if (status === 502) return Response.json({ statusCode: 502, error: "HISTORY_POPULATION_FAILED", message: "Дозаполнение остановлено с ошибкой. Часть работы могла быть сохранена.", partialWorkMayHavePersisted: true }, { status, headers: noStore });
  return Response.json({ statusCode: status, error: status === 400 ? "Bad Request" : status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : status === 503 ? "Service Unavailable" : "Internal Server Error" }, { status, headers: noStore });
}

export function createPositionHistoryPopulationRouteHandler(execute: Executor) {
  return async (request: Request): Promise<Response> => {
    const originRejection = rejectCrossOriginWrite(request);
    if (originRejection) return originRejection;
    let parsed: ReturnType<typeof positionHistoryPopulationRequestSchema.safeParse>;
    try { parsed = positionHistoryPopulationRequestSchema.safeParse(await request.json()); }
    catch { return error(400); }
    if (!parsed.success) return error(400);
    let upstream: Response;
    try { upstream = await execute(parsed.data); }
    catch { return error(503); }
    if (upstream.status === 400 || upstream.status === 401 || upstream.status === 403 || upstream.status === 409 || upstream.status === 502) return error(upstream.status);
    if (!upstream.ok) return error(upstream.status >= 500 ? 500 : 400);
    try {
      const result = positionHistoryPopulationResultSchema.safeParse(await upstream.json());
      return result.success ? Response.json(result.data, { headers: noStore }) : error(502);
    } catch { return error(502); }
  };
}
