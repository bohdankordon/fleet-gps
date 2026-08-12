import { Injectable } from "@nestjs/common";
import { PositionBackfillStatus, Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import type { PositionHistoryHorizonCheckpointFact, PositionHistoryHorizonRepository, PositionHistoryHorizonSlice } from "./position-history-horizon.types";

type RawHorizonCheckpointFact = Readonly<{
  sliceIndex: number;
  vehicleId: string;
  providerDisabled: boolean;
  exactCheckpointStatus: string | null;
  exactCheckpointNextFrom: Date | null;
}>;

function checkpointStatus(value: string | null): PositionBackfillStatus | null {
  if (value === null) return null;
  if (value === PositionBackfillStatus.COMPLETED || value === PositionBackfillStatus.RUNNING || value === PositionBackfillStatus.PENDING) return value;
  throw new Error("Unknown position history checkpoint status");
}

@Injectable()
export class PrismaPositionHistoryHorizonRepository implements PositionHistoryHorizonRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async inspect(slices: readonly PositionHistoryHorizonSlice[]): Promise<readonly PositionHistoryHorizonCheckpointFact[]> {
    if (slices.length === 0) return Object.freeze([]);
    const targetValues = Prisma.join(slices.map((slice) => Prisma.sql`(${slice.index}::integer, ${slice.from}::timestamptz, ${slice.to}::timestamptz)`));
    const rows = await this.database.getClient().$queryRaw<RawHorizonCheckpointFact[]>(Prisma.sql`
      WITH targets (slice_index, range_from, range_to) AS (
        VALUES ${targetValues}
      )
      SELECT
        targets.slice_index AS "sliceIndex",
        vehicle.id AS "vehicleId",
        vehicle.disabled AS "providerDisabled",
        checkpoint.status::text AS "exactCheckpointStatus",
        checkpoint.next_from AS "exactCheckpointNextFrom"
      FROM targets
      CROSS JOIN vehicles AS vehicle
      LEFT JOIN vehicle_position_backfill_checkpoints AS checkpoint
        ON checkpoint.vehicle_id = vehicle.id
       AND checkpoint.range_from = targets.range_from
       AND checkpoint.range_to = targets.range_to
      ORDER BY targets.slice_index ASC, vehicle.id ASC
    `);
    return Object.freeze(rows.map((row) => Object.freeze({
      sliceIndex: row.sliceIndex,
      vehicleId: row.vehicleId,
      providerDisabled: row.providerDisabled === true,
      exactCheckpointStatus: checkpointStatus(row.exactCheckpointStatus),
      exactCheckpointNextFrom: row.exactCheckpointNextFrom,
    })));
  }
}
