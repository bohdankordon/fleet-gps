import { Body, Controller, HttpException, Post, Req, Res } from "@nestjs/common";
import { RequireAnyPermission } from "../auth/auth.decorators";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { buildUserActor } from "../audit";
import { PositionHistoryHorizonPopulationError } from "../position-history-horizon-population/position-history-horizon-population.error";
import { PositionHistoryHorizonAlreadyRunningError } from "./position-history-horizon-execution-lock.service";
import { PositionHistoryHorizonExecutionFinalizationError, PositionHistoryHorizonExecutionService } from "./position-history-horizon-execution.service";
import type { PositionHistoryHorizonExecutionResponse } from "./position-history-horizon-execution.types";
import { parsePositionHistoryHorizonExecutionRequest } from "./position-history-horizon-execution.validation";

type HttpResponse = { setHeader(name: string, value: string): void };

@Controller("system/position-history")
export class PositionHistoryHorizonExecutionController {
  public constructor(private readonly execution: PositionHistoryHorizonExecutionService) {}

  @Post("horizon-populate")
  @RequireAnyPermission("historyAdmin.populate")
  public async populate(@Req() authenticatedRequest: AuthenticatedRequest, @Body() body: unknown, @Res({ passthrough: true }) response: HttpResponse): Promise<PositionHistoryHorizonExecutionResponse> {
    response.setHeader("Cache-Control", "no-store");
    const request = parsePositionHistoryHorizonExecutionRequest(body);
    if (!request) throw new HttpException({ statusCode: 400, error: "Bad Request", message: "Проверьте контрольную точку и параметры запуска." }, 400);
    try { return await this.execution.run(request, buildUserActor(authenticatedRequest.auth!.id, authenticatedRequest.auth!.login)); }
    catch (error) {
      if (error instanceof PositionHistoryHorizonAlreadyRunningError) throw new HttpException({ statusCode: 409, error: "HISTORY_POPULATION_ALREADY_RUNNING", message: "Дозаполнение истории уже выполняется." }, 409);
      if (error instanceof PositionHistoryHorizonPopulationError || error instanceof PositionHistoryHorizonExecutionFinalizationError) throw new HttpException({ statusCode: 502, error: "HISTORY_POPULATION_FAILED", message: "Дозаполнение остановлено с ошибкой. Часть работы могла быть сохранена.", partialWorkMayHavePersisted: true }, 502);
      throw new HttpException({ statusCode: 500, error: "Internal Server Error", message: "Не удалось выполнить дозаполнение истории." }, 500);
    }
  }
}
