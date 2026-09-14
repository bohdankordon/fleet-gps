import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import type { PositionHistoryPolicyReconciliationResult, PositionHistoryRetentionFacts, PositionHistoryRetentionRepository, PositionHistoryRetentionStatusCounts } from "./position-history-retention.types";

type RawRetentionAggregate = Readonly<Record<string, bigint | Date | null>>;
type RawCount = Readonly<{ count: bigint }>;
type RawDeleted = Readonly<{ deleted: bigint }>;

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
          ,COUNT(*) FILTER (
            WHERE observed_at < ${policyCutoff}
              AND NOT EXISTS (
                SELECT 1
                FROM vehicle_position_backfill_checkpoints surviving
                WHERE surviving.vehicle_id = vehicle_position_observations.vehicle_id
                  AND surviving.range_to >= ${policyCutoff}
                  AND surviving.range_from <= vehicle_position_observations.observed_at
                  AND surviving.range_to >= vehicle_position_observations.observed_at
              )
          )::bigint AS "executableObservationCandidates"
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
      ),
      policy_reconciliation_facts AS (
        SELECT
          (SELECT COUNT(*) FROM vehicle_history_ingestion_cursors WHERE coverage_from < ${policyCutoff})::bigint AS "cursorFloorCandidates",
          (SELECT COUNT(*) FROM position_history_replay_checkpoints WHERE status <> 'COMPLETED' AND next_from < ${policyCutoff})::bigint AS "replayCheckpointCandidates"
      )
      SELECT * FROM observation_facts CROSS JOIN checkpoint_facts CROSS JOIN policy_reconciliation_facts
    `);
    const row = rows[0];
    if (!row) throw new Error("Missing position history retention aggregate");
    const oldest = row.oldestObservedAt;
    const newest = row.newestObservedAt;
    if (oldest !== null && !(oldest instanceof Date)) throw new Error("Invalid oldest retention observation timestamp");
    if (newest !== null && !(newest instanceof Date)) throw new Error("Invalid newest retention observation timestamp");
    return Object.freeze({
      policyReconciliation: Object.freeze({
        cursorFloorCandidates: safeCount(row.cursorFloorCandidates, "cursorFloorCandidates"),
        replayCheckpointCandidates: safeCount(row.replayCheckpointCandidates, "replayCheckpointCandidates"),
      }),
      observations: Object.freeze({
        total: safeCount(row.observationTotal, "observationTotal"),
        olderThanPolicyCutoff: safeCount(row.observationOlder, "observationOlder"),
        atOrAfterPolicyCutoff: safeCount(row.observationProtected, "observationProtected"),
        oldestObservedAt: oldest,
        newestObservedAt: newest,
        vehiclesWithObservationsOlderThanCutoff: safeCount(row.affectedVehicles, "affectedVehicles"),
        executableObservationCandidates: safeCount(row.executableObservationCandidates, "executableObservationCandidates"),
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

  public countActiveDurableRuns(): Promise<number> {
    return this.database.getClient().positionHistoryPopulationRun.count({ where: { status: { in: ["PENDING", "RUNNING"] } } });
  }

  public async reconcilePolicyFloor(policyCutoff: Date): Promise<PositionHistoryPolicyReconciliationResult> {
    return this.database.getClient().$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<Array<Readonly<{ advancedCursorFloors: bigint; advancedReplayCheckpoints: bigint; completedReplayCheckpoints: bigint }>>>(Prisma.sql`
        WITH advanced_cursors AS (
          UPDATE vehicle_history_ingestion_cursors
          SET coverage_from = ${policyCutoff},
              confirmed_through = GREATEST(confirmed_through, ${policyCutoff}),
              updated_at = CURRENT_TIMESTAMP
          WHERE coverage_from < ${policyCutoff}
          RETURNING vehicle_id
        ), advanced_replay AS (
          UPDATE position_history_replay_checkpoints
          SET next_from = LEAST(GREATEST(next_from, ${policyCutoff}), range_to),
              status = CASE WHEN range_to <= ${policyCutoff} THEN 'COMPLETED'::"PositionBackfillStatus" ELSE 'RUNNING'::"PositionBackfillStatus" END,
              updated_at = CURRENT_TIMESTAMP
          WHERE status <> 'COMPLETED'
            AND next_from < ${policyCutoff}
          RETURNING status
        )
        SELECT
          (SELECT COUNT(*) FROM advanced_cursors)::bigint AS "advancedCursorFloors",
          (SELECT COUNT(*) FROM advanced_replay)::bigint AS "advancedReplayCheckpoints",
          (SELECT COUNT(*) FROM advanced_replay WHERE status = 'COMPLETED')::bigint AS "completedReplayCheckpoints"
      `);
      const row = rows[0];
      return Object.freeze({
        advancedCursorFloors: safeCount(row?.advancedCursorFloors, "advancedCursorFloors"),
        advancedReplayCheckpoints: safeCount(row?.advancedReplayCheckpoints, "advancedReplayCheckpoints"),
        completedReplayCheckpoints: safeCount(row?.completedReplayCheckpoints, "completedReplayCheckpoints"),
      });
    });
  }

  public async countFullyObsoleteCheckpoints(policyCutoff: Date): Promise<number> {
    const rows = await this.database.getClient().$queryRaw<RawCount[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM vehicle_position_backfill_checkpoints
      WHERE range_to < ${policyCutoff}
    `);
    return safeCount(rows[0]?.count, "fullyObsoleteCheckpoints");
  }

  public async countExecutableObservationCandidates(policyCutoff: Date): Promise<number> {
    const rows = await this.database.getClient().$queryRaw<RawCount[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM vehicle_position_observations observation
      WHERE observation.observed_at < ${policyCutoff}
        AND NOT EXISTS (
          SELECT 1
          FROM vehicle_position_backfill_checkpoints surviving
          WHERE surviving.vehicle_id = observation.vehicle_id
            AND surviving.range_to >= ${policyCutoff}
            AND surviving.range_from <= observation.observed_at
            AND surviving.range_to >= observation.observed_at
        )
    `);
    return safeCount(rows[0]?.count, "executableObservationCandidates");
  }

  public deleteFullyObsoleteCheckpointBatch(policyCutoff: Date, limit: number): Promise<number> {
    return this.runDeleteBatch(Prisma.sql`
      WITH candidates AS (
        SELECT id
        FROM vehicle_position_backfill_checkpoints
        WHERE range_to < ${policyCutoff}
        ORDER BY range_to ASC, range_from ASC, vehicle_id ASC, id ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      ), deleted_rows AS (
        DELETE FROM vehicle_position_backfill_checkpoints checkpoint
        USING candidates
        WHERE checkpoint.id = candidates.id
        RETURNING checkpoint.id
      )
      SELECT COUNT(*)::bigint AS deleted FROM deleted_rows
    `);
  }

  public deleteExecutableObservationBatch(policyCutoff: Date, limit: number): Promise<number> {
    return this.runDeleteBatch(Prisma.sql`
      WITH candidates AS (
        SELECT observation.id
        FROM vehicle_position_observations observation
        WHERE observation.observed_at < ${policyCutoff}
          AND NOT EXISTS (
            SELECT 1
            FROM vehicle_position_backfill_checkpoints surviving
            WHERE surviving.vehicle_id = observation.vehicle_id
              AND surviving.range_to >= ${policyCutoff}
              AND surviving.range_from <= observation.observed_at
              AND surviving.range_to >= observation.observed_at
          )
        ORDER BY observation.observed_at ASC, observation.id ASC
        LIMIT ${limit}
        FOR UPDATE OF observation SKIP LOCKED
      ), deleted_rows AS (
        DELETE FROM vehicle_position_observations observation
        USING candidates
        WHERE observation.id = candidates.id
        RETURNING observation.id
      )
      SELECT COUNT(*)::bigint AS deleted FROM deleted_rows
    `);
  }

  private async runDeleteBatch(statement: Prisma.Sql): Promise<number> {
    return this.database.getClient().$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<RawDeleted[]>(statement);
      return safeCount(rows[0]?.deleted, "deletedRows");
    });
  }
}
