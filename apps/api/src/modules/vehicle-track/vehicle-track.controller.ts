import { Controller, Get, HttpException, Param, Query } from "@nestjs/common";
import { normalizeUuid } from "../../common/uuid.validation";
import type { VehicleTrackResponse } from "./vehicle-track-read-models";
import { parseVehicleTrackRange } from "./vehicle-track-query-params";
import { VehicleTrackQueryService } from "./vehicle-track-query.service";
import { VehicleTrackNotFoundError, VehicleTrackTooDenseError } from "./vehicle-track.types";
import { RequireAnyPermission } from "../auth/auth.decorators";

@Controller("vehicles")
@RequireAnyPermission("trips.view")
export class VehicleTrackController {
  public constructor(private readonly queryService: VehicleTrackQueryService) {}

  @Get(":vehicleId/track")
  public async getTrack(@Param("vehicleId") rawVehicleId: string, @Query("from") rawFrom: unknown, @Query("to") rawTo: unknown): Promise<VehicleTrackResponse> {
    const vehicleId = normalizeUuid(rawVehicleId);
    const range = parseVehicleTrackRange(rawFrom, rawTo);
    if (!vehicleId || !range) throw new HttpException({ statusCode: 400, error: "Bad Request" }, 400);
    try {
      return await this.queryService.getTrack(vehicleId, range.from, range.to);
    } catch (error) {
      if (error instanceof VehicleTrackNotFoundError) throw new HttpException({ statusCode: 404, error: "Not Found" }, 404);
      if (error instanceof VehicleTrackTooDenseError) throw new HttpException({ statusCode: 422, error: "Unprocessable Entity" }, 422);
      throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500);
    }
  }
}
