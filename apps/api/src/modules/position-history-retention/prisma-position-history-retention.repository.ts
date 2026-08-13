import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import type { PositionHistoryRetentionFacts, PositionHistoryRetentionRepository, PositionHistoryRetentionStatusCounts } from "./position-history-retention.types";

type RawRetentionAggregate = Readonly<Record<string, bigint | Date | null>>;

function safeCount(value: bigint | Date | null | undefined, field: string): number {
  if (typeof value !== "bigint") throw new Error(`Missing retention aggregate: ${field}`);
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error(`Retention aggregate exceeds safe integer range: ${field}`);
  return count;
}

function statusCounts(row: RawRetentionAggregate, prefix: string): PositionHistoryRetentionStatusCounts {
  return Object.freeze({
    pending: safeCount(row[`${prefix}Pending`], `${prefix}Pending`),
    running: safeCount(row[`${prefix}Running`], `${prefix}Running`),
    completed: safeCount(row[`${prefix}Completed`], `${prefix}Completed`),
  });
}

@Injectable()
export class PrismaPositionHistoryRetentionRepository implements PositionHistoryRetentionRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async inspect(policyCutoff: Date): Promise<PositionHistoryRetentionFacts> {
    const rows = await this.database.getClient().$queryRaw<RawRetentionAggregate[]>(Prisma.sql`
      WITH observation_facts AS (
        SELECT
          COUNT(*)::bigint AS "observationTotal",
          COUNT(*) FILTER (WHERE observed_at < ${policyCutoff})::bigint AS "observationOlder",
          COUNT(*) FILTER (WHERE observed_at >= ${policyCutoff})::bigint AS "observationProtected",
          MIN(observed_at) AS "oldestObservedAt",
          MAX(observed_at) AS "newestObservedAt",
          COUNT(DISTINCT vehicle_id) FILTER (WHERE observed_at < ${policyCutoff})::bigint AS "affectedVehicles"
        FROM vehicle_position_observations
      ),
      checkpoint_facts AS (
        SELECT
          COUNT(*)::bigint AS "checkpointTotal",
          COUNT(*) FILTER (WHERE range_to < ${policyCutoff})::bigint AS "fullyObsolete",
          COUNT(*) FILTER (WHERE range_from < ${policyCutoff} AND range_to >= ${policyCutoff})::bigint AS "boundaryOverlap",
          COUNT(*) FILTER (WHERE range_from >= ${policyCutoff})::bigint AS "protected",
          COUNT(*) FILTER (WHERE range_to < ${policyCutoff} AND status = 'PENDING')::bigint AS "obsoletePending",
          COUNT(*) FILTER (WHERE range_to < ${policyCutoff} AND status = 'RUNNING')::bigint AS "obsoleteRunning",
          COUNT(*) FILTER (WHERE range_to < ${policyCutoff} AND status = 'COMPLETED')::bigint AS "obsoleteCompleted",
          COUNT(*) FILTER (WHERE range_from < ${policyCutoff} AND range_to >= ${policyCutoff} AND status = 'PENDING')::bigint AS "overlapPending",
          COUNT(*) FILTER (WHERE range_from < ${policyCutoff} AND range_to >= ${policyCutoff} AND status = 'RUNNING')::bigint AS "overlapRunning",
          COUNT(*) FILTER (WHERE range_from < ${policyCutoff} AND range_to >= ${policyCutoff} AND status = 'COMPLETED')::bigint AS "overlapCompleted",
          COUNT(*) FILTER (WHERE range_from >= ${policyCutoff} AND status = 'PENDING')::bigint AS "protectedPending",
          COUNT(*) FILTER (WHERE range_from >= ${policyCutoff} AND status = 'RUNNING')::bigint AS "protectedRunning",
          COUNT(*) FILTER (WHERE range_from >= ${policyCutoff} AND status = 'COMPLETED')::bigint AS "protectedCompleted",
          COUNT(*) FILTER (WHERE range_from < ${policyCutoff} AND range_to = ${policyCutoff})::bigint AS "endingExactlyAtCutoff",
          COUNT(*) FILTER (WHERE range_from = ${policyCutoff})::bigint AS "startingExactlyAtCutoff",
          COUNT(*) FILTER (WHERE range_from < ${policyCutoff} AND range_to > ${policyCutoff})::bigint AS "strictlyCrossingCutoff"
        FROM vehicle_position_backfill_checkpoints
      )
      SELECT * FROM observation_facts CROSS JOIN checkpoint_facts
    `);
    const row = rows[0];
    if (!row) throw new Error("Missing position history retention aggregate");
    const oldest = row.oldestObservedAt;
    const newest = row.newestObservedAt;
    if (oldest !== null && !(oldest instanceof Date)) throw new Error("Invalid oldest retention observation timestamp");
    if (newest !== null && !(newest instanceof Date)) throw new Error("Invalid newest retention observation timestamp");
    return Object.freeze({
      observations: Object.freeze({
        total: safeCount(row.observationTotal, "observationTotal"),
        olderThanPolicyCutoff: safeCount(row.observationOlder, "observationOlder"),
        atOrAfterPolicyCutoff: safeCount(row.observationProtected, "observationProtected"),
        oldestObservedAt: oldest,
        newestObservedAt: newest,
        vehiclesWithObservationsOlderThanCutoff: safeCount(row.affectedVehicles, "affectedVehicles"),
      }),
      checkpoints: Object.freeze({
        total: safeCount(row.checkpointTotal, "checkpointTotal"),
        fullyObsolete: safeCount(row.fullyObsolete, "fullyObsolete"),
        boundaryOverlap: safeCount(row.boundaryOverlap, "boundaryOverlap"),
        protected: safeCount(row.protected, "protected"),
        fullyObsoleteByStatus: statusCounts(row, "obsolete"),
        boundaryOverlapByStatus: statusCounts(row, "overlap"),
        protectedByStatus: statusCounts(row, "protected"),
        endingExactlyAtCutoff: safeCount(row.endingExactlyAtCutoff, "endingExactlyAtCutoff"),
        startingExactlyAtCutoff: safeCount(row.startingExactlyAtCutoff, "startingExactlyAtCutoff"),
        strictlyCrossingCutoff: safeCount(row.strictlyCrossingCutoff, "strictlyCrossingCutoff"),
      }),
    });
  }
}
