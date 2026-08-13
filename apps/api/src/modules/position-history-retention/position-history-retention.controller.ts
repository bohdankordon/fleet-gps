import { Controller, Get, HttpException, Query, Res } from "@nestjs/common";
import { RequireAnyPermission } from "../auth/auth.decorators";
import { PositionHistoryRetentionService } from "./position-history-retention.service";
import type { PositionHistoryRetentionPlan } from "./position-history-retention.types";

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
}
