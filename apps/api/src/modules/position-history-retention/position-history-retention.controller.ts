import { Body, Controller, Get, HttpException, Post, Query, Req, Res } from "@nestjs/common";
import { AdminOnly, RequireAnyPermission } from "../auth/auth.decorators";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { buildUserActor } from "../audit";
import { parsePositionHistoryRetentionExecutionRequest } from "./position-history-retention-execution.validation";
import { PositionHistoryRetentionService } from "./position-history-retention.service";
import { PositionHistoryRetentionExecutionError, type PositionHistoryRetentionExecutionResult, type PositionHistoryRetentionPlan } from "./position-history-retention.types";

type HttpResponse = { setHeader(name: string, value: string): void };

@Controller("system/position-history")
@RequireAnyPermission("historyAdmin.view")
export class PositionHistoryRetentionController {
  public constructor(private readonly retention: PositionHistoryRetentionService) {}

  @Get("retention-plan")
  public async getRetentionPlan(@Query() query: Record<string, unknown>, @Res({ passthrough: true }) response: HttpResponse): Promise<PositionHistoryRetentionPlan> {
    response.setHeader("Cache-Control", "no-store");
    if (Object.keys(query).length > 0) throw new HttpException({ statusCode: 400, error: "Bad Request" }, 400);
    try { return await this.retention.getRetentionPlan(); }
    catch { throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500); }
  }

  @Post("retention-execute")
  @AdminOnly()
  public async executeRetention(@Req() request: AuthenticatedRequest, @Body() body: unknown, @Res({ passthrough: true }) response: HttpResponse): Promise<PositionHistoryRetentionExecutionResult> {
    response.setHeader("Cache-Control", "no-store");
    const parsed = parsePositionHistoryRetentionExecutionRequest(body);
    if (parsed === null) throw new HttpException({ statusCode: 400, error: "Bad Request" }, 400);
    try { return await this.retention.executeRetention(parsed, buildUserActor(request.auth!.id, request.auth!.login)); }
    catch (error) {
      if (error instanceof PositionHistoryRetentionExecutionError) {
        const message = error.code === "LOCK_UNAVAILABLE"
          ? "История GPS сейчас изменяется другой операцией. Повторите попытку позже."
          : error.code === "ACTIVE_DURABLE_RUN"
            ? "Сейчас запланировано или выполняется дозаполнение истории. Очистку можно запустить после его завершения."
            : "План хранения изменился. Обновите страницу и проверьте данные снова.";
        throw new HttpException({ statusCode: 409, error: error.code, message }, 409);
      }
      throw new HttpException({ statusCode: 500, error: "RETENTION_EXECUTION_FAILED", message: "Не удалось завершить очистку истории. Обновите план перед следующей попыткой.", partialWorkMayHavePersisted: true }, 500);
    }
  }
}
