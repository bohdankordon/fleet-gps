import { Controller, Get, HttpException, Param } from "@nestjs/common";
import { normalizeUuid } from "../../common/uuid.validation";
import type { VehicleDetailsResponse } from "./vehicle-details-read-models";
import { VehicleDetailsQueryService } from "./vehicle-details-query.service";
import { VehicleDetailsNotFoundError } from "./vehicle-details.types";
import { RequireAnyPermission } from "../auth/auth.decorators";

@Controller("vehicles")
@RequireAnyPermission("vehicles.view")
export class VehicleDetailsController {
  public constructor(private readonly query: VehicleDetailsQueryService) {}

  @Get(":vehicleId/details")
  public async getDetails(@Param("vehicleId") rawVehicleId: string): Promise<VehicleDetailsResponse> {
    const vehicleId = normalizeUuid(rawVehicleId);
    if (vehicleId === null) throw new HttpException({ statusCode: 400, error: "Bad Request" }, 400);
    try {
      return await this.query.getDetails(vehicleId);
    } catch (error) {
      if (error instanceof VehicleDetailsNotFoundError) throw new HttpException({ statusCode: 404, error: "Not Found" }, 404);
      throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500);
    }
  }
}
