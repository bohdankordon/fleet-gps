import { Injectable } from "@nestjs/common";
import { PositionBackfillStatus, PositionHistoryReplayKind, PositionHistoryReplayRunStatus, Prisma, type PositionHistoryReplayCheckpoint, type PositionHistoryReplayRun } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { PositionHistoryReplayCheckpointInitializationError, PositionHistoryReplayCheckpointStaleProgressError, PositionHistoryReplayGenerationConflictError, PositionHistoryReplayInputError, PositionHistoryReplayRunNotFoundError } from "./position-history-replay-generation.errors";
import type { EnsurePositionHistoryReplayCheckpointInput, EnsurePositionHistoryReplayRunInput, PersistPositionHistoryReplayWindowInput, PersistPositionHistoryReplayWindowResult, PositionHistoryReplayRepository } from "./position-history-replay-generation.types";

const transactionTimeoutMs = 30_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LockedReplayRun = Readonly<{
  id: string;
  status: PositionHistoryReplayRunStatus;
  rangeFrom: Date;
  rangeTo: Date;
}>;

function finiteDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validRunInput(input: EnsurePositionHistoryReplayRunInput): boolean {
  return Object.values(PositionHistoryReplayKind).includes(input.kind)
    && finiteDate(input.generationAnchor)
    && finiteDate(input.rangeFrom)
    && finiteDate(input.rangeTo)
    && input.rangeFrom.getTime() < input.rangeTo.getTime();
}

function validCheckpoint(input: EnsurePositionHistoryReplayCheckpointInput): boolean {
  return uuid.test(input.vehicleId)
    && finiteDate(input.rangeFrom)
    && finiteDate(input.rangeTo)
    && input.rangeFrom.getTime() < input.rangeTo.getTime();
}

function sameTarget(run: PositionHistoryReplayRun, input: EnsurePositionHistoryReplayRunInput): boolean {
  return run.rangeFrom.getTime() === input.rangeFrom.getTime() && run.rangeTo.getTime() === input.rangeTo.getTime();
}

@Injectable()
export class PrismaPositionHistoryReplayRepository implements PositionHistoryReplayRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async ensureRun(input: EnsurePositionHistoryReplayRunInput): Promise<PositionHistoryReplayRun> {
    if (!validRunInput(input)) throw new PositionHistoryReplayInputError();
    const client = this.database.getClient();
    let run: PositionHistoryReplayRun;
    try {
      run = await client.positionHistoryReplayRun.upsert({
        where: { kind_generationAnchor: { kind: input.kind, generationAnchor: input.generationAnchor } },
        create: {
          kind: input.kind,
          generationAnchor: input.generationAnchor,
          rangeFrom: input.rangeFrom,
          rangeTo: input.rangeTo,
        },
        update: {},
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const concurrent = await client.positionHistoryReplayRun.findUnique({ where: { kind_generationAnchor: { kind: input.kind, generationAnchor: input.generationAnchor } } });
      if (concurrent === null) throw error;
      run = concurrent;
    }
    if (!sameTarget(run, input)) throw new PositionHistoryReplayGenerationConflictError();
    return run;
  }

  public findRun(kind: PositionHistoryReplayKind, generationAnchor: Date): Promise<PositionHistoryReplayRun | null> {
    if (!Object.values(PositionHistoryReplayKind).includes(kind) || !finiteDate(generationAnchor)) throw new PositionHistoryReplayInputError();
    return this.database.getClient().positionHistoryReplayRun.findUnique({ where: { kind_generationAnchor: { kind, generationAnchor } } });
  }

  public async ensureCheckpoints(runId: string, checkpoints: readonly EnsurePositionHistoryReplayCheckpointInput[]): Promise<readonly PositionHistoryReplayCheckpoint[]> {
    if (!uuid.test(runId) || checkpoints.some((checkpoint) => !validCheckpoint(checkpoint))) throw new PositionHistoryReplayInputError();
    const byIdentity = new Map<string, EnsurePositionHistoryReplayCheckpointInput>();
    for (const checkpoint of checkpoints) byIdentity.set(`${checkpoint.vehicleId}:${checkpoint.rangeFrom.getTime()}:${checkpoint.rangeTo.getTime()}`, checkpoint);
    const requested = [...byIdentity.values()];
    if (requested.length === 0) return Object.freeze([]);

    try {
      return await this.database.getClient().$transaction(async (transaction) => {
        const runs = await transaction.$queryRaw<LockedReplayRun[]>(Prisma.sql`
          SELECT "id", "status", "range_from" AS "rangeFrom", "range_to" AS "rangeTo"
          FROM "position_history_replay_runs"
          WHERE "id" = ${runId}::uuid
          FOR UPDATE
        `);
        const run = runs[0];
        if (run === undefined) throw new PositionHistoryReplayRunNotFoundError();
        if (requested.some((checkpoint) => checkpoint.rangeFrom < run.rangeFrom || checkpoint.rangeTo > run.rangeTo)) throw new PositionHistoryReplayCheckpointInitializationError();

        const identities = requested.map((checkpoint) => ({ runId, vehicleId: checkpoint.vehicleId, rangeFrom: checkpoint.rangeFrom, rangeTo: checkpoint.rangeTo }));
        const existing = await transaction.positionHistoryReplayCheckpoint.findMany({ where: { OR: identities } });
        if (run.status === PositionHistoryReplayRunStatus.COMPLETED && existing.length !== requested.length) throw new PositionHistoryReplayCheckpointInitializationError();
        await transaction.positionHistoryReplayCheckpoint.createMany({
          data: requested.map((checkpoint) => ({ runId, vehicleId: checkpoint.vehicleId, rangeFrom: checkpoint.rangeFrom, rangeTo: checkpoint.rangeTo, nextFrom: checkpoint.rangeFrom })),
          skipDuplicates: true,
        });
        const result = await transaction.positionHistoryReplayCheckpoint.findMany({
          where: { OR: identities },
          orderBy: [{ rangeFrom: "asc" }, { vehicleId: "asc" }, { rangeTo: "asc" }, { id: "asc" }],
        });
        if (result.length !== requested.length) throw new PositionHistoryReplayCheckpointInitializationError();
        return Object.freeze(result);
      }, { timeout: transactionTimeoutMs });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") throw new PositionHistoryReplayCheckpointInitializationError();
      throw error;
    }
  }

  public listIncompleteCheckpoints(runId: string, limit: number): Promise<readonly PositionHistoryReplayCheckpoint[]> {
    if (!uuid.test(runId) || !Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) throw new PositionHistoryReplayInputError();
    return this.database.getClient().positionHistoryReplayCheckpoint.findMany({
      where: { runId, status: { not: PositionBackfillStatus.COMPLETED } },
      orderBy: [{ rangeFrom: "asc" }, { vehicleId: "asc" }, { rangeTo: "asc" }, { id: "asc" }],
      take: limit,
    });
  }

  public async persistReplayWindow(input: PersistPositionHistoryReplayWindowInput): Promise<PersistPositionHistoryReplayWindowResult> {
    if (!uuid.test(input.runId) || !uuid.test(input.leaseOwner) || !uuid.test(input.checkpointId) || !uuid.test(input.vehicleId)
      || !finiteDate(input.expectedNextFrom) || !finiteDate(input.nextFrom) || input.nextFrom <= input.expectedNextFrom) throw new PositionHistoryReplayInputError();

    return this.database.getClient().$transaction(async (transaction) => {
      const rows: Prisma.VehiclePositionObservationCreateManyInput[] = input.candidates.map((candidate) => ({ vehicleId: input.vehicleId, ...candidate }));
      const inserted = rows.length === 0 ? 0 : (await transaction.vehiclePositionObservation.createMany({ data: rows, skipDuplicates: true })).count;
      const advanced = await transaction.$queryRaw<Array<{ status: PositionBackfillStatus }>>(Prisma.sql`
        UPDATE "position_history_replay_checkpoints" AS checkpoint
        SET "next_from" = ${input.nextFrom},
            "status" = CASE WHEN ${input.nextFrom} = checkpoint."range_to" THEN 'COMPLETED'::"PositionBackfillStatus" ELSE 'RUNNING'::"PositionBackfillStatus" END,
            "updated_at" = CURRENT_TIMESTAMP
        FROM "position_history_replay_runs" AS run
        WHERE checkpoint."id" = ${input.checkpointId}::uuid
          AND checkpoint."run_id" = ${input.runId}::uuid
          AND checkpoint."vehicle_id" = ${input.vehicleId}::uuid
          AND checkpoint."next_from" = ${input.expectedNextFrom}
          AND checkpoint."status" <> 'COMPLETED'
          AND checkpoint."range_from" <= ${input.expectedNextFrom}
          AND ${input.nextFrom} <= checkpoint."range_to"
          AND run."id" = checkpoint."run_id"
          AND run."status" = 'RUNNING'
          AND run."lease_owner" = ${input.leaseOwner}::uuid
          AND run."lease_expires_at" > CURRENT_TIMESTAMP
        RETURNING checkpoint."status"
      `);
      if (advanced.length !== 1) throw new PositionHistoryReplayCheckpointStaleProgressError();
      return Object.freeze({ inserted, duplicates: rows.length - inserted, checkpointStatus: advanced[0]!.status });
    }, { timeout: transactionTimeoutMs });
  }
}
