import { Injectable } from "@nestjs/common";
import { validateGeoJsonPolygon } from "../alert-settings/alert-settings.validation";
import { AlertSettingsStateError, type GeoJsonPolygon } from "../alert-settings/alert-settings.types";
import { CityGeofenceRepository } from "./city-geofence.repository";

@Injectable()
export class CityGeofenceManagementService {
  public constructor(private readonly repository: CityGeofenceRepository) {}

  public validateCandidate(input: unknown): GeoJsonPolygon {
    const polygon = validateGeoJsonPolygon(input);
    if (polygon === null) throw new AlertSettingsStateError("invalid");
    return polygon;
  }

  public async replaceCityGeofence(input: unknown): Promise<void> {
    const polygon = this.validateCandidate(input);
    await this.repository.replaceSingletonPolygon(polygon);
  }

  public async clearCityGeofence(): Promise<void> {
    await this.repository.replaceSingletonPolygon(null);
  }
}
