import { Inject, Injectable } from "@nestjs/common";
import { PositionHistoryPopulationRunStatus, type PositionHistoryPopulationRun } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { POSITION_HISTORY_POPULATION_RUN_LEASE_DURATION_MS } from "./position-history-population-run.constants";
import { POSITION_HISTORY_POPULATION_RUN_CLOCK } from "./position-history-population-run.tokens";
import type { ClaimedPositionHistoryPopulationRun, PositionHistoryPopulationRunClock } from "./position-history-population-run.types";

@Injectable()
export class PositionHistoryPopulationRunStateService {
  public constructor(
    private readonly database: DatabaseService,
    @Inject(POSITION_HISTORY_POPULATION_RUN_CLOCK) private readonly clock: PositionHistoryPopulationRunClock,
  ) {}

  public findEligible(runId?: string): Promise<PositionHistoryPopulationRun | null> {
    const now = this.clock.now();
    return this.database.getClient().positionHistoryPopulationRun.findFirst({
      where: {
        ...(runId === undefined ? {} : { id: runId }),
        OR: [
          { status: PositionHistoryPopulationRunStatus.PENDING },
          { status: PositionHistoryPopulationRunStatus.RUNNING, leaseExpiresAt: { lte: now } },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  public async claim(runId: string, leaseOwner: string): Promise<ClaimedPositionHistoryPopulationRun | null> {
    const candidate = await this.findEligible(runId);
    if (candidate === null) return null;
    const now = this.clock.now();
    const leaseExpiresAt = new Date(now.getTime() + POSITION_HISTORY_POPULATION_RUN_LEASE_DURATION_MS);
    const eligible = candidate.status === PositionHistoryPopulationRunStatus.PENDING
      ? { status: PositionHistoryPopulationRunStatus.PENDING }
      : { status: PositionHistoryPopulationRunStatus.RUNNING, leaseExpiresAt: { lte: now } };
    const claimed = await this.database.getClient().positionHistoryPopulationRun.updateMany({
      where: { id: runId, ...eligible },
      data: {
        status: PositionHistoryPopulationRunStatus.RUNNING,
        startedAt: candidate.startedAt ?? now,
        leaseOwner,
        leaseExpiresAt,
        finishedAt: null,
        safeFailureCode: null,
      },
    });
    if (claimed.count !== 1) return null;
    const run = await this.database.getClient().positionHistoryPopulationRun.findUnique({ where: { id: runId } });
    if (run === null || run.leaseOwner !== leaseOwner || run.leaseExpiresAt === null) return null;
    return run as ClaimedPositionHistoryPopulationRun;
  }

  public async heartbeat(runId: string, leaseOwner: string): Promise<boolean> {
    const now = this.clock.now();
    const renewed = await this.database.getClient().positionHistoryPopulationRun.updateMany({
      where: { id: runId, status: PositionHistoryPopulationRunStatus.RUNNING, leaseOwner, leaseExpiresAt: { gt: now } },
      data: { leaseExpiresAt: new Date(now.getTime() + POSITION_HISTORY_POPULATION_RUN_LEASE_DURATION_MS) },
    });
    return renewed.count === 1;
  }

  public async getOwned(runId: string, leaseOwner: string): Promise<PositionHistoryPopulationRun | null> {
    const now = this.clock.now();
    return this.database.getClient().positionHistoryPopulationRun.findFirst({
      where: { id: runId, status: PositionHistoryPopulationRunStatus.RUNNING, leaseOwner, leaseExpiresAt: { gt: now } },
    });
  }

  public async yield(runId: string, leaseOwner: string): Promise<boolean> {
    const now = this.clock.now();
    const yielded = await this.database.getClient().positionHistoryPopulationRun.updateMany({
      where: { id: runId, status: PositionHistoryPopulationRunStatus.RUNNING, leaseOwner, leaseExpiresAt: { gt: now } },
      data: { status: PositionHistoryPopulationRunStatus.PENDING, leaseOwner: null, leaseExpiresAt: null },
    });
    return yielded.count === 1;
  }

  public async succeed(runId: string, leaseOwner: string): Promise<boolean> {
    const now = this.clock.now();
    const finished = await this.database.getClient().positionHistoryPopulationRun.updateMany({
      where: { id: runId, status: PositionHistoryPopulationRunStatus.RUNNING, leaseOwner, leaseExpiresAt: { gt: now } },
      data: { status: PositionHistoryPopulationRunStatus.SUCCEEDED, finishedAt: now, leaseOwner: null, leaseExpiresAt: null, safeFailureCode: null },
    });
    return finished.count === 1;
  }

  public async fail(runId: string, leaseOwner: string, safeFailureCode: string): Promise<boolean> {
    const now = this.clock.now();
    const finished = await this.database.getClient().positionHistoryPopulationRun.updateMany({
      where: { id: runId, status: PositionHistoryPopulationRunStatus.RUNNING, leaseOwner, leaseExpiresAt: { gt: now } },
      data: { status: PositionHistoryPopulationRunStatus.FAILED, finishedAt: now, leaseOwner: null, leaseExpiresAt: null, safeFailureCode },
    });
    return finished.count === 1;
  }
}
