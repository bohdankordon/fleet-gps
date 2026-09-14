import { Controller, Get, HttpException, Optional, Query } from "@nestjs/common";
import { parseAbsoluteTimestamp } from "../vehicle-track/vehicle-track-query-params";
import { toPositionHistoryHorizonStatusResponse } from "./position-history-status.read-model";
import { PositionHistoryStatusService } from "./position-history-status.service";
import type { PositionHistoryHorizonStatusResponse } from "./position-history-status.types";
import { RequireAnyPermission } from "../auth/auth.decorators";
import { PositionHistoryIngestionStatusService, type PositionHistoryIngestionStatusResponse } from "./position-history-ingestion-status.service";

@Controller("system/position-history")
@RequireAnyPermission("historyAdmin.view")
export class PositionHistoryStatusController {
  public constructor(private readonly status: PositionHistoryStatusService, @Optional() private readonly ingestion?: PositionHistoryIngestionStatusService) {}

  @Get("horizon-status")
  public async getStatus(@Query("to") rawTo: unknown): Promise<PositionHistoryHorizonStatusResponse> {
    const to = parseAbsoluteTimestamp(rawTo);
    if (!to) throw new HttpException({ statusCode: 400, error: "Bad Request" }, 400);
    try { return toPositionHistoryHorizonStatusResponse(await this.status.inspect(to)); }
    catch { throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500); }
  }
  @Get("ingestion-status")
  @RequireAnyPermission("historyAdmin.view")
  public async getIngestionStatus(): Promise<PositionHistoryIngestionStatusResponse> {
    if (this.ingestion === undefined || this.ingestion === null) throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500);
    try { return await this.ingestion.inspect(); }
    catch { throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500); }
  }
}
