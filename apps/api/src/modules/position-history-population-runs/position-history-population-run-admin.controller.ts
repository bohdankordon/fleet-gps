import { Body, Controller, Get, HttpException, Post, Req, Res } from "@nestjs/common";
import { RequireAnyPermission } from "../auth/auth.decorators";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { PositionHistoryPopulationRunConflictError } from "./position-history-population-run.errors";
import { PositionHistoryPopulationRunAdminService } from "./position-history-population-run-admin.service";
import type { SafePositionHistoryPopulationRun } from "./position-history-population-run-admin.types";
import { parseCreatePositionHistoryPopulationRunRequest } from "./position-history-population-run-admin.validation";

type HttpResponse = { setHeader(name: string, value: string): void };
const invalidRequest = Object.freeze({ statusCode: 400, error: "Bad Request", message: "Проверьте контрольную точку и параметры фонового запуска." });
const activeConflict = Object.freeze({ statusCode: 409, error: "HISTORY_DURABLE_POPULATION_ALREADY_RUNNING", message: "Фоновое дозаполнение уже запущено." });

@Controller("system/position-history/population-runs")
export class PositionHistoryPopulationRunAdminController {
  public constructor(private readonly runs: PositionHistoryPopulationRunAdminService) {}

  @Post()
  @RequireAnyPermission("historyAdmin.populate")
  public async create(@Req() request: AuthenticatedRequest, @Body() body: unknown, @Res({ passthrough: true }) response: HttpResponse): Promise<SafePositionHistoryPopulationRun> {
    response.setHeader("Cache-Control", "no-store");
    const parsed = parseCreatePositionHistoryPopulationRunRequest(body);
    if (parsed === null) throw new HttpException(invalidRequest, 400);
    try { return await this.runs.create(request.auth!.id, parsed); }
    catch (error) {
      if (error instanceof PositionHistoryPopulationRunConflictError) throw new HttpException(activeConflict, 409);
      throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500);
    }
  }

  @Get("active")
  @RequireAnyPermission("historyAdmin.view")
  public active(@Res({ passthrough: true }) response: HttpResponse): Promise<SafePositionHistoryPopulationRun | null> {
    response.setHeader("Cache-Control", "no-store");
    return this.runs.active();
  }

  @Get("recent")
  @RequireAnyPermission("historyAdmin.view")
  public recent(@Res({ passthrough: true }) response: HttpResponse): Promise<readonly SafePositionHistoryPopulationRun[]> {
    response.setHeader("Cache-Control", "no-store");
    return this.runs.recent();
  }
}
