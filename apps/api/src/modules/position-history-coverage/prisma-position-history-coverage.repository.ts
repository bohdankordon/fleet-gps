import { Injectable } from "@nestjs/common";
import { PositionBackfillStatus, Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import type { PositionHistoryCoverageRepository, PositionHistoryCoverageTarget, PositionHistoryCoverageVehicleFacts } from "./position-history-coverage.types";

type RawCoverageRow = Readonly<{
  vehicleId: string;
  providerDisabled: boolean;
  exactCheckpointStatus: string | null;
  observationRows: bigint;
  fleetSyncRows: bigint;
  historicalBackfillRows: bigint;
  firstObservedAt: Date | null;
  lastObservedAt: Date | null;
}>;

function safeCount(value: bigint): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("Position history coverage count exceeds safe integer range");
  return count;
}

function checkpointStatus(value: string | null): PositionBackfillStatus | null {
  if (value === null) return null;
  if (value === PositionBackfillStatus.COMPLETED || value === PositionBackfillStatus.RUNNING || value === PositionBackfillStatus.PENDING) return value;
  throw new Error("Unknown position history checkpoint status");
}

@Injectable()
export class PrismaPositionHistoryCoverageRepository implements PositionHistoryCoverageRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async inspect(target: PositionHistoryCoverageTarget): Promise<readonly PositionHistoryCoverageVehicleFacts[]> {
    const rows = await this.database.getClient().$queryRaw<RawCoverageRow[]>(Prisma.sql`
      WITH observation_aggregates AS (
        SELECT
          observation.vehicle_id,
          COUNT(*) AS observation_rows,
          COUNT(*) FILTER (WHERE observation.ingestion_source = 'FLEET_SYNC') AS fleet_sync_rows,
          COUNT(*) FILTER (WHERE observation.ingestion_source = 'HISTORICAL_BACKFILL') AS historical_backfill_rows,
          MIN(observation.observed_at) AS first_observed_at,
          MAX(observation.observed_at) AS last_observed_at
        FROM vehicle_position_observations AS observation
        WHERE observation.observed_at >= ${target.from}
          AND observation.observed_at <= ${target.to}
        GROUP BY observation.vehicle_id
      )
      SELECT
        vehicle.id AS "vehicleId",
        vehicle.disabled AS "providerDisabled",
        checkpoint.status::text AS "exactCheckpointStatus",
        COALESCE(observation_aggregates.observation_rows, 0)::bigint AS "observationRows",
        COALESCE(observation_aggregates.fleet_sync_rows, 0)::bigint AS "fleetSyncRows",
        COALESCE(observation_aggregates.historical_backfill_rows, 0)::bigint AS "historicalBackfillRows",
        observation_aggregates.first_observed_at AS "firstObservedAt",
        observation_aggregates.last_observed_at AS "lastObservedAt"
      FROM vehicles AS vehicle
      LEFT JOIN vehicle_position_backfill_checkpoints AS checkpoint
        ON checkpoint.vehicle_id = vehicle.id
       AND checkpoint.range_from = ${target.from}
       AND checkpoint.range_to = ${target.to}
      LEFT JOIN observation_aggregates ON observation_aggregates.vehicle_id = vehicle.id
      ORDER BY vehicle.id ASC
    `);

    return Object.freeze(rows.map((row) => Object.freeze({
      vehicleId: row.vehicleId,
      providerDisabled: row.providerDisabled === true,
      exactCheckpointStatus: checkpointStatus(row.exactCheckpointStatus),
      observationRows: safeCount(row.observationRows),
      fleetSyncRows: safeCount(row.fleetSyncRows),
      historicalBackfillRows: safeCount(row.historicalBackfillRows),
      firstObservedAt: row.firstObservedAt,
      lastObservedAt: row.lastObservedAt,
    })));
  }
}
