import { Injectable } from "@nestjs/common";
import { PositionHistoryReplayKind, PositionHistoryReplayRunStatus, Prisma, type PositionHistoryReplayRun } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { PositionHistoryReplayInputError } from "./position-history-replay-generation.errors";
import type { ClaimPositionHistoryReplayRunInput, OwnedPositionHistoryReplayRun, OwnPositionHistoryReplayRunInput, RenewPositionHistoryReplayRunLeaseInput } from "./position-history-replay-generation.types";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function finiteDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validOwnership(input: OwnPositionHistoryReplayRunInput): boolean {
  return uuid.test(input.runId) && uuid.test(input.leaseOwner) && finiteDate(input.now);
}

@Injectable()
export class PositionHistoryReplayRunStateService {
  public constructor(private readonly database: DatabaseService) {}

  public findClaimable(now: Date, kind?: PositionHistoryReplayKind): Promise<PositionHistoryReplayRun | null> {
    if (!finiteDate(now) || (kind !== undefined && !Object.values(PositionHistoryReplayKind).includes(kind))) throw new PositionHistoryReplayInputError();
    return this.database.getClient().positionHistoryReplayRun.findFirst({
      where: {
        ...(kind === undefined ? {} : { kind }),
        OR: [
          { status: PositionHistoryReplayRunStatus.PENDING },
          { status: PositionHistoryReplayRunStatus.RUNNING, leaseExpiresAt: { lte: now } },
        ],
      },
      orderBy: [{ generationAnchor: "asc" }, { kind: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
  }

  public async claimRun(input: ClaimPositionHistoryReplayRunInput): Promise<OwnedPositionHistoryReplayRun | null> {
    if (!validOwnership(input) || !finiteDate(input.leaseExpiresAt) || input.leaseExpiresAt <= input.now) throw new PositionHistoryReplayInputError();
    const candidate = await this.database.getClient().positionHistoryReplayRun.findUnique({ where: { id: input.runId } });
    if (candidate === null) return null;
    const eligible = candidate.status === PositionHistoryReplayRunStatus.PENDING
      ? { status: PositionHistoryReplayRunStatus.PENDING }
      : candidate.status === PositionHistoryReplayRunStatus.RUNNING && candidate.leaseExpiresAt !== null && candidate.leaseExpiresAt <= input.now
        ? { status: PositionHistoryReplayRunStatus.RUNNING, leaseExpiresAt: { lte: input.now } }
        : null;
    if (eligible === null) return null;
    const claimed = await this.database.getClient().positionHistoryReplayRun.updateMany({
      where: { id: input.runId, ...eligible },
      data: {
        status: PositionHistoryReplayRunStatus.RUNNING,
        startedAt: candidate.startedAt ?? input.now,
        leaseOwner: input.leaseOwner,
        leaseExpiresAt: input.leaseExpiresAt,
        completedAt: null,
      },
    });
    if (claimed.count !== 1) return null;
    const run = await this.database.getClient().positionHistoryReplayRun.findUnique({ where: { id: input.runId } });
    if (run === null || run.leaseOwner !== input.leaseOwner || run.leaseExpiresAt === null) return null;
    return run as OwnedPositionHistoryReplayRun;
  }

  public async renewLease(input: RenewPositionHistoryReplayRunLeaseInput): Promise<boolean> {
    if (!validOwnership(input) || !finiteDate(input.leaseExpiresAt) || input.leaseExpiresAt <= input.now) throw new PositionHistoryReplayInputError();
    const renewed = await this.database.getClient().positionHistoryReplayRun.updateMany({
      where: {
        id: input.runId,
        status: PositionHistoryReplayRunStatus.RUNNING,
        leaseOwner: input.leaseOwner,
        leaseExpiresAt: { gt: input.now },
      },
      data: { leaseExpiresAt: input.leaseExpiresAt },
    });
    return renewed.count === 1;
  }

  public async yieldRun(input: OwnPositionHistoryReplayRunInput): Promise<boolean> {
    if (!validOwnership(input)) throw new PositionHistoryReplayInputError();
    const yielded = await this.database.getClient().positionHistoryReplayRun.updateMany({
      where: {
        id: input.runId,
        status: PositionHistoryReplayRunStatus.RUNNING,
        leaseOwner: input.leaseOwner,
        leaseExpiresAt: { gt: input.now },
      },
      data: { status: PositionHistoryReplayRunStatus.PENDING, leaseOwner: null, leaseExpiresAt: null },
    });
    return yielded.count === 1;
  }

  public async completeRun(input: OwnPositionHistoryReplayRunInput): Promise<boolean> {
    if (!validOwnership(input)) throw new PositionHistoryReplayInputError();
    const completed = await this.database.getClient().$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "position_history_replay_runs" AS run
      SET "status" = 'COMPLETED',
          "completed_at" = ${input.now},
          "lease_owner" = NULL,
          "lease_expires_at" = NULL,
          "updated_at" = CURRENT_TIMESTAMP
      WHERE run."id" = ${input.runId}::uuid
        AND run."status" = 'RUNNING'
        AND run."lease_owner" = ${input.leaseOwner}::uuid
        AND run."lease_expires_at" > ${input.now}
        AND EXISTS (
          SELECT 1 FROM "position_history_replay_checkpoints" AS checkpoint
          WHERE checkpoint."run_id" = run."id"
        )
        AND NOT EXISTS (
          SELECT 1 FROM "position_history_replay_checkpoints" AS checkpoint
          WHERE checkpoint."run_id" = run."id"
            AND checkpoint."status" <> 'COMPLETED'
        )
      RETURNING run."id"
    `);
    return completed.length === 1;
  }
}
