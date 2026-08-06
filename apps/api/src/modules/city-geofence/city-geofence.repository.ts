import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { AlertSettingsStateError, type GeoJsonPolygon } from "../alert-settings/alert-settings.types";

@Injectable()
export class CityGeofenceRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async replaceSingletonPolygon(polygon: GeoJsonPolygon | null): Promise<void> {
    try {
      const singleton = await this.database.getClient().applicationSettings.findUnique({ where: { id: 1 }, select: { id: true } });
      if (singleton === null) throw new AlertSettingsStateError("missing");
      await this.database.getClient().applicationSettings.update({
        where: { id: 1 },
        data: { cityGeofenceGeoJson: polygon === null ? Prisma.DbNull : polygon },
        select: { id: true },
      });
    } catch (error) {
      if (error instanceof AlertSettingsStateError) throw error;
      throw new AlertSettingsStateError("database");
    }
  }
}
