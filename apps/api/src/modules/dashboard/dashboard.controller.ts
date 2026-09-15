import { Controller, Get, HttpException, Query, Req } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { DashboardQueryParamsError, parseDashboardQueryParams } from "./dashboard-query-params";
import type { DashboardVehiclesResponse } from "./dashboard-read-models";
import { DashboardQueryService } from "./dashboard-query.service";
import { RequireAnyPermission } from "../auth/auth.decorators";

@Controller("dashboard")
@RequireAnyPermission("fleet.view")
export class DashboardController {
  public constructor(private readonly query: DashboardQueryService) {}
  @Get("vehicles")
  public async getVehicles(@Query() rawQuery: Record<string, unknown>, @Req() request: AuthenticatedRequest): Promise<DashboardVehiclesResponse> {
    try { return await this.query.getVehicles(parseDashboardQueryParams(rawQuery), request.auth!.id); }
    catch (error) {
      if (error instanceof DashboardQueryParamsError) throw new HttpException({ statusCode: 400, error: "Bad Request" }, 400);
      throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500);
    }
  }
}
