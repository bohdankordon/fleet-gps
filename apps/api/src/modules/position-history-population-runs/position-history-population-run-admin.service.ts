import { Injectable } from "@nestjs/common";
import { PositionHistoryPopulationRunInitiatorType, PositionHistoryPopulationRunStatus, type Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import type { AuditUserActor } from "../audit";
import { PositionHistoryPopulationRunCreationService } from "./position-history-population-run-creation.service";
import type { CreatePositionHistoryPopulationRunRequest, PositionHistoryPopulationRunSafeSource, SafePositionHistoryPopulationRun } from "./position-history-population-run-admin.types";

const safeSelect = Object.freeze({ id: true, status: true, initiatorType: true, to: true, excludeProviderDisabled: true, windowBudget: true, committedWindows: true, createdAt: true, startedAt: true, finishedAt: true, safeFailureCode: true }) satisfies Prisma.PositionHistoryPopulationRunSelect;

function failureCategory(code: string | null): SafePositionHistoryPopulationRun["failureCategory"] {
  if (code === null) return null;
  if (code === "HISTORY_POPULATION_EXECUTION_FAILED") return "EXECUTION";
  if (code === "HISTORY_POPULATION_WORKER_FAILED") return "WORKER";
  return "UNKNOWN";
}

export function toSafePositionHistoryPopulationRun(run: PositionHistoryPopulationRunSafeSource): SafePositionHistoryPopulationRun {
  return Object.freeze({
    id: run.id,
    status: run.status,
    initiatorType: run.initiatorType,
    to: run.to.toISOString(),
    excludeProviderDisabled: run.excludeProviderDisabled,
    windowBudget: run.windowBudget,
    committedWindows: run.committedWindows,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    failureCategory: failureCategory(run.safeFailureCode),
  });
}

@Injectable()
export class PositionHistoryPopulationRunAdminService {
  public constructor(private readonly database: DatabaseService, private readonly creation: PositionHistoryPopulationRunCreationService) {}

  public async create(actor: AuditUserActor, request: CreatePositionHistoryPopulationRunRequest): Promise<SafePositionHistoryPopulationRun> {
    const run = await this.creation.createRun({
      initiatorType: PositionHistoryPopulationRunInitiatorType.USER,
      requestedByUserId: actor.actorUserId,
      requestedByLoginSnapshot: actor.actorLoginSnapshot,
      to: request.to,
      excludeProviderDisabled: request.excludeProviderDisabled,
      windowBudget: request.windowBudget,
    });
    return toSafePositionHistoryPopulationRun(run);
  }

  public async active(): Promise<SafePositionHistoryPopulationRun | null> {
    const run = await this.database.getClient().positionHistoryPopulationRun.findFirst({
      where: { status: { in: [PositionHistoryPopulationRunStatus.PENDING, PositionHistoryPopulationRunStatus.RUNNING] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: safeSelect,
    });
    return run === null ? null : toSafePositionHistoryPopulationRun(run);
  }

  public async recent(): Promise<readonly SafePositionHistoryPopulationRun[]> {
    const runs = await this.database.getClient().positionHistoryPopulationRun.findMany({
      where: { status: { in: [PositionHistoryPopulationRunStatus.SUCCEEDED, PositionHistoryPopulationRunStatus.FAILED] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      select: safeSelect,
    });
    return Object.freeze(runs.map(toSafePositionHistoryPopulationRun));
  }
}
