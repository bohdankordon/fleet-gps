import { Controller, Get, HttpException } from "@nestjs/common";
import type { CityGeofenceDiagnostic, CityGeofenceMapResponse } from "./city-geofence.types";
import { CityGeofenceService } from "./city-geofence.service";

@Controller("system")
export class CityGeofenceController {
  public constructor(private readonly service: CityGeofenceService) {}

  @Get("city-geofence")
  public async getDiagnostic(): Promise<CityGeofenceDiagnostic> {
    try { return await this.service.getDiagnostic(); }
    catch { throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500); }
  }
  @Get("city-geofence/map")
  public async getMapProjection(): Promise<CityGeofenceMapResponse> {
    try { return await this.service.getMapProjection(); }
    catch { throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500); }
  }
}
