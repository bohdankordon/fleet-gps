import { Controller, Get, HttpException, Param, Query } from "@nestjs/common";
import { normalizeUuid } from "../../common/uuid.validation";
import { parseVehicleTrackOverviewRange } from "./vehicle-track-overview-query-params";
import { VehicleTrackOverviewQueryService } from "./vehicle-track-overview-query.service";
import type { VehicleTrackOverviewResponse } from "./vehicle-track-overview-read-models";
import { VehicleTrackOverviewNotFoundError, VehicleTrackOverviewTooFragmentedError } from "./vehicle-track-overview.types";
import { RequireAnyPermission } from "../auth/auth.decorators";

@Controller("vehicles")
@RequireAnyPermission("trips.view")
export class VehicleTrackOverviewController {
  public constructor(private readonly queryService: VehicleTrackOverviewQueryService) {}

  @Get(":vehicleId/track/overview")
  public async getOverview(
    @Param("vehicleId") rawVehicleId: string,
    @Query("from") rawFrom: unknown,
    @Query("to") rawTo: unknown,
  ): Promise<VehicleTrackOverviewResponse> {
    const vehicleId = normalizeUuid(rawVehicleId);
    const range = parseVehicleTrackOverviewRange(rawFrom, rawTo);
    if (!vehicleId || !range) throw new HttpException({ statusCode: 400, error: "Bad Request" }, 400);
    try {
      return await this.queryService.getOverview(vehicleId, range.from, range.to);
    } catch (error) {
      if (error instanceof VehicleTrackOverviewNotFoundError) throw new HttpException({ statusCode: 404, error: "Not Found" }, 404);
      if (error instanceof VehicleTrackOverviewTooFragmentedError) throw new HttpException({ statusCode: 422, error: "Unprocessable Entity" }, 422);
      throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500);
    }
  }
}
