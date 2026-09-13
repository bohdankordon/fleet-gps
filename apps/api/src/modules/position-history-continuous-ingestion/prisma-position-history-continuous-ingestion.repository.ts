import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import type { PositionHistoryContinuousIngestionRepository, PositionHistoryContinuousPersistResult, PositionHistoryContinuousVehicle } from "./position-history-continuous-ingestion.types";
import type { PositionHistoryCandidate } from "../position-history";

@Injectable()
export class PrismaPositionHistoryContinuousIngestionRepository implements PositionHistoryContinuousIngestionRepository {
  public constructor(private readonly database: DatabaseService) {}

  public listMappedVehicles(): Promise<readonly PositionHistoryContinuousVehicle[]> {
    return this.database.getClient().vehicle.findMany({
      orderBy: { id: "asc" },
      select: { id: true, externalDeviceId: true, disabled: true },
    }).then((vehicles) => vehicles.map(({ id, externalDeviceId, disabled }) => Object.freeze({ vehicleId: id, externalDeviceId, disabled })));
  }

  public async persistReplay(vehicleId: string, candidates: readonly PositionHistoryCandidate[]): Promise<PositionHistoryContinuousPersistResult> {
    const rows: Prisma.VehiclePositionObservationCreateManyInput[] = candidates.map((candidate) => ({ vehicleId, ...candidate }));
    const inserted = rows.length === 0 ? 0 : (await this.database.getClient().vehiclePositionObservation.createMany({ data: rows, skipDuplicates: true })).count;
    return Object.freeze({ inserted, duplicates: rows.length - inserted });
  }
}
