import { Injectable } from "@nestjs/common";
import { PositionHistoryPopulationRunInitiatorType, Prisma, type PositionHistoryPopulationRun } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { PositionHistoryPopulationRunConflictError, PositionHistoryPopulationRunInputError } from "./position-history-population-run.errors";
import type { CreatePositionHistoryPopulationRunInput } from "./position-history-population-run.types";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function valid(input: CreatePositionHistoryPopulationRunInput): boolean {
  if (!Object.values(PositionHistoryPopulationRunInitiatorType).includes(input.initiatorType)) return false;
  if (!(input.to instanceof Date) || !Number.isFinite(input.to.getTime()) || typeof input.excludeProviderDisabled !== "boolean" || !Number.isSafeInteger(input.windowBudget) || input.windowBudget <= 0 || input.windowBudget > 2_147_483_647) return false;
  if (input.initiatorType === PositionHistoryPopulationRunInitiatorType.USER) return input.requestedByUserId !== undefined && uuid.test(input.requestedByUserId);
  return input.requestedByUserId === undefined;
}

@Injectable()
export class PositionHistoryPopulationRunCreationService {
  public constructor(private readonly database: DatabaseService) {}

  public async createRun(input: CreatePositionHistoryPopulationRunInput): Promise<PositionHistoryPopulationRun> {
    if (!valid(input)) throw new PositionHistoryPopulationRunInputError();
    try {
      return await this.database.getClient().positionHistoryPopulationRun.create({
        data: {
          initiatorType: input.initiatorType,
          ...(input.requestedByUserId === undefined ? {} : { requestedByUserId: input.requestedByUserId }),
          to: new Date(input.to.getTime()),
          excludeProviderDisabled: input.excludeProviderDisabled,
          windowBudget: input.windowBudget,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new PositionHistoryPopulationRunConflictError();
      throw error;
    }
  }
}
