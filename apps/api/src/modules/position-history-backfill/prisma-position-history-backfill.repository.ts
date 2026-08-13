import { Injectable } from "@nestjs/common";
import { PositionBackfillStatus, Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { PositionHistoryBackfillConcurrentProgressError, PositionHistoryBackfillDurableAccountingError, PositionHistoryBackfillVehicleNotFoundError } from "./position-history-backfill.errors";
import type { PersistBackfillWindowInput, PersistBackfillWindowResult, PositionHistoryBackfillCheckpoint, PositionHistoryBackfillRepository, PositionHistoryBackfillTarget } from "./position-history-backfill.types";

const transactionTimeoutMs = 30_000;

@Injectable()
export class PrismaPositionHistoryBackfillRepository implements PositionHistoryBackfillRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async prepare(target: PositionHistoryBackfillTarget): Promise<PositionHistoryBackfillCheckpoint> {
    const client = this.database.getClient();
    const vehicle = await client.vehicle.findUnique({ where: { id: target.vehicleId }, select: { id: true, externalDeviceId: true } });
    if (vehicle === null) throw new PositionHistoryBackfillVehicleNotFoundError();
    const checkpoint = await client.vehiclePositionBackfillCheckpoint.upsert({
      where: { vehicleId_rangeFrom_rangeTo: { vehicleId: vehicle.id, rangeFrom: target.from, rangeTo: target.to } },
      create: { vehicleId: vehicle.id, rangeFrom: target.from, rangeTo: target.to, nextFrom: target.from },
      update: {},
      select: { id: true, vehicleId: true, rangeFrom: true, rangeTo: true, nextFrom: true, status: true },
    });
    return Object.freeze({ ...checkpoint, externalDeviceId: vehicle.externalDeviceId });
  }

  public async persistWindow(input: PersistBackfillWindowInput): Promise<PersistBackfillWindowResult> {
    const client = this.database.getClient();
    return client.$transaction(async (transaction) => {
      const rows: Prisma.VehiclePositionObservationCreateManyInput[] = input.candidates.map((candidate) => ({ vehicleId: input.vehicleId, ...candidate }));
      const inserted = rows.length === 0 ? 0 : (await transaction.vehiclePositionObservation.createMany({ data: rows, skipDuplicates: true })).count;
      const advanced = await transaction.vehiclePositionBackfillCheckpoint.updateMany({
        where: { id: input.checkpointId, vehicleId: input.vehicleId, nextFrom: input.expectedNextFrom, status: { not: PositionBackfillStatus.COMPLETED } },
        data: { nextFrom: input.nextFrom, status: input.completed ? PositionBackfillStatus.COMPLETED : PositionBackfillStatus.RUNNING },
      });
      if (advanced.count !== 1) throw new PositionHistoryBackfillConcurrentProgressError();
      if (input.durableAccounting !== undefined) {
        const accounted = await transaction.$executeRaw(Prisma.sql`
          UPDATE "position_history_population_runs"
          SET "committed_windows" = "committed_windows" + 1,
              "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${input.durableAccounting.runId}::uuid
            AND "status" = 'RUNNING'
            AND "lease_owner" = ${input.durableAccounting.leaseOwner}::uuid
            AND "committed_windows" < "window_budget"
        `);
        if (accounted !== 1) throw new PositionHistoryBackfillDurableAccountingError();
      }
      return Object.freeze({ inserted, duplicates: rows.length - inserted });
    }, { timeout: transactionTimeoutMs });
  }
}
