import { Controller, Get, HttpException, Optional, Query, Res } from "@nestjs/common";
import { PositionHistoryHorizonService } from "../position-history-horizon/position-history-horizon.service";
import { parseAbsoluteTimestamp } from "../vehicle-track/vehicle-track-query-params";
import { toPositionHistoryHorizonPlanResponse } from "./position-history-horizon-plan.read-model";
import type { PositionHistoryHorizonPlanResponse } from "./position-history-horizon-plan.types";
import { RequireAnyPermission } from "../auth/auth.decorators";
import { PositionHistoryIngestionStatusService, type PositionHistoryIngestionStatusResponse } from "./position-history-ingestion-status.service";

@Controller("system/position-history")
@RequireAnyPermission("historyAdmin.view")
export class PositionHistoryStatusController {
  public constructor(private readonly horizon: PositionHistoryHorizonService, @Optional() private readonly ingestion?: PositionHistoryIngestionStatusService) {}

  @Get("horizon-plan")
  public async getHorizonPlan(@Query("to") rawTo: unknown): Promise<PositionHistoryHorizonPlanResponse> {
    const to = parseAbsoluteTimestamp(rawTo);
    if (!to) throw new HttpException({ statusCode: 400, error: "Bad Request" }, 400);
    try { return toPositionHistoryHorizonPlanResponse(await this.horizon.run(to)); }
    catch { throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500); }
  }
  @Get("ingestion-status")
  @RequireAnyPermission("historyAdmin.view")
  public async getIngestionStatus(@Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }): Promise<PositionHistoryIngestionStatusResponse> {
    response.setHeader("Cache-Control", "no-store");
    if (this.ingestion === undefined || this.ingestion === null) throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500);
    try { return await this.ingestion.inspect(); }
    catch { throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500); }
  }
}
