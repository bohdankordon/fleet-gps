import { rejectCrossOriginWrite } from "../auth/same-origin";
import { positionHistoryRetentionExecutionRequestSchema, positionHistoryRetentionExecutionResultSchema, type PositionHistoryRetentionExecutionRequest } from "./position-history-retention-contract";

type Executor = (request: PositionHistoryRetentionExecutionRequest) => Promise<Response>;
const noStore = { "Cache-Control": "no-store" };
const conflictCodes = ["LOCK_UNAVAILABLE", "ACTIVE_DURABLE_RUN", "STALE_PLAN"] as const;

function safeError(status: number, code?: string): Response {
  if (status === 409) {
    const safeCode = conflictCodes.includes(code as never) ? code : "LOCK_UNAVAILABLE";
    const message = safeCode === "ACTIVE_DURABLE_RUN"
      ? "Сейчас запланировано или выполняется дозаполнение истории. Очистку можно запустить после его завершения."
      : safeCode === "STALE_PLAN"
        ? "План хранения изменился. Обновите страницу и проверьте данные снова."
        : "История GPS сейчас изменяется другой операцией. Повторите попытку позже.";
    return Response.json({ statusCode: 409, error: safeCode, message }, { status: 409, headers: noStore });
  }
  const safeStatus = status === 400 || status === 401 || status === 403 ? status : status >= 500 ? 500 : 400;
  return Response.json({ statusCode: safeStatus, error: safeStatus === 400 ? "Bad Request" : safeStatus === 401 ? "Unauthorized" : safeStatus === 403 ? "Forbidden" : "RETENTION_EXECUTION_FAILED" }, { status: safeStatus, headers: noStore });
}

export function createPositionHistoryRetentionExecutionRouteHandler(execute: Executor) {
  return async (request: Request): Promise<Response> => {
    const rejection = rejectCrossOriginWrite(request);
    if (rejection) return rejection;
    let parsed: ReturnType<typeof positionHistoryRetentionExecutionRequestSchema.safeParse>;
    try { parsed = positionHistoryRetentionExecutionRequestSchema.safeParse(await request.json()); }
    catch { return safeError(400); }
    if (!parsed.success) return safeError(400);
    let upstream: Response;
    try { upstream = await execute(parsed.data); }
    catch { return safeError(503); }
    if (upstream.status === 409) {
      let code: string | undefined;
      try { const body = await upstream.json() as { error?: unknown }; if (typeof body.error === "string") code = body.error; } catch {}
      return safeError(409, code);
    }
    if (!upstream.ok) return safeError(upstream.status);
    try {
      const result = positionHistoryRetentionExecutionResultSchema.safeParse(await upstream.json());
      return result.success ? Response.json(result.data, { headers: noStore }) : safeError(502);
    } catch { return safeError(502); }
  };
}
