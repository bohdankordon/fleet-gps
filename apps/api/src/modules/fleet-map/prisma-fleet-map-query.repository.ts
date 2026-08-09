import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { MAX_FLEET_MAP_VEHICLES, type FleetMapQueryRepository, type FleetMapStoredSnapshot } from "./fleet-map-query.repository";
import { FleetMapQueryInternalError } from "./fleet-map.types";

const readTransactionTimeoutMs = 10_000;

@Injectable()
export class PrismaFleetMapQueryRepository implements FleetMapQueryRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async getSnapshot(): Promise<FleetMapStoredSnapshot> {
    return this.database.getClient().$transaction(async (transaction) => {
      const settings = await transaction.applicationSettings.findUnique({
        where: { id: 1 },
        select: { positionFreshnessSeconds: true },
      });
      if (!settings) throw new FleetMapQueryInternalError();

      const vehicles = await transaction.vehicle.findMany({
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: MAX_FLEET_MAP_VEHICLES + 1,
        select: {
          id: true,
          name: true,
          currentState: {
            select: {
              fixTime: true,
              latitude: true,
              longitude: true,
              speedKph: true,
              valid: true,
              outdated: true,
            },
          },
        },
      });
      if (vehicles.length > MAX_FLEET_MAP_VEHICLES) throw new FleetMapQueryInternalError();
      return { positionFreshnessSeconds: settings.positionFreshnessSeconds, vehicles };
    }, { timeout: readTransactionTimeoutMs });
  }
}
