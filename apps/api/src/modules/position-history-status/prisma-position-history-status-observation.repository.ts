import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import type { PositionHistoryObservationAggregate, PositionHistoryStatusObservationRepository } from "./position-history-status.types";

type RawObservationAggregate = Readonly<{
  rowCount: bigint;
  vehiclesWithObservations: bigint;
  firstObservationAt: Date | null;
  lastObservationAt: Date | null;
}>;

function safeCount(value: bigint): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("Position history status count exceeds safe integer range");
  return count;
}

@Injectable()
export class PrismaPositionHistoryStatusObservationRepository implements PositionHistoryStatusObservationRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async inspect(from: Date, to: Date): Promise<PositionHistoryObservationAggregate> {
    const rows = await this.database.getClient().$queryRaw<RawObservationAggregate[]>(Prisma.sql`
      SELECT
        COUNT(*)::bigint AS "rowCount",
        COUNT(DISTINCT observation.vehicle_id)::bigint AS "vehiclesWithObservations",
        MIN(observation.observed_at) AS "firstObservationAt",
        MAX(observation.observed_at) AS "lastObservationAt"
      FROM vehicle_position_observations AS observation
      WHERE observation.observed_at >= ${from}
        AND observation.observed_at <= ${to}
    `);
    const row = rows[0];
    if (!row) throw new Error("Missing position history observation aggregate");
    return Object.freeze({
      rowCount: safeCount(row.rowCount),
      vehiclesWithObservations: safeCount(row.vehiclesWithObservations),
      firstObservationAt: row.firstObservationAt,
      lastObservationAt: row.lastObservationAt,
    });
  }
}
