import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import type { PositionHistoryFleetBackfillRepository, PositionHistoryFleetBackfillTarget, PositionHistoryFleetBackfillVehicle } from "./position-history-backfill.types";

@Injectable()
export class PrismaPositionHistoryFleetBackfillRepository implements PositionHistoryFleetBackfillRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async inspect(target: PositionHistoryFleetBackfillTarget): Promise<readonly PositionHistoryFleetBackfillVehicle[]> {
    const vehicles = await this.database.getClient().vehicle.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        externalDeviceId: true,
        positionBackfillCheckpoints: {
          where: { rangeFrom: target.from, rangeTo: target.to },
          take: 1,
          select: { nextFrom: true, status: true },
        },
      },
    });
    return Object.freeze(vehicles.map((vehicle) => Object.freeze({
      vehicleId: vehicle.id,
      externalDeviceId: vehicle.externalDeviceId,
      checkpoint: vehicle.positionBackfillCheckpoints[0] ?? null,
    })));
  }
}
