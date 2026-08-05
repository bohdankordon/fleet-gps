import { Controller, Get, HttpException, Query } from "@nestjs/common";
import { DashboardQueryParamsError, parseDashboardQueryParams } from "./dashboard-query-params";
import type { DashboardVehiclesResponse } from "./dashboard-read-models";
import { DashboardQueryService } from "./dashboard-query.service";

@Controller("dashboard")
export class DashboardController {
  public constructor(private readonly query: DashboardQueryService) {}
  @Get("vehicles")
  public async getVehicles(@Query() rawQuery: Record<string, unknown>): Promise<DashboardVehiclesResponse> {
    try { return await this.query.getVehicles(parseDashboardQueryParams(rawQuery)); }
    catch (error) {
      if (error instanceof DashboardQueryParamsError) throw new HttpException({ statusCode: 400, error: "Bad Request" }, 400);
      throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500);
    }
  }
}
