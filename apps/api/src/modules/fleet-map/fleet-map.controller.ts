import { Controller, Get, HttpException, Req } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types";
import type { FleetMapResponse } from "./fleet-map-read-models";
import { FleetMapQueryService } from "./fleet-map-query.service";
import { RequireAnyPermission } from "../auth/auth.decorators";

@Controller("fleet")
@RequireAnyPermission("map.view")
export class FleetMapController {
  public constructor(private readonly query: FleetMapQueryService) {}

  @Get("map")
  public async getSnapshot(@Req() request: AuthenticatedRequest): Promise<FleetMapResponse> {
    try { return await this.query.getSnapshot(request.auth!.id); }
    catch { throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500); }
  }
}
