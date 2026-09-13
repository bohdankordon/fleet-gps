import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { PositionHistoryIngestionCursorInvalidAdvanceError, PositionHistoryIngestionCursorStaleProgressError, PositionHistoryIngestionCursorVehicleNotFoundError } from "./position-history-ingestion-cursor.errors";
import type { PersistContiguousHistoryResult, PersistContiguousHistoryResultInput, PositionHistoryIngestionCursorRepository, VehicleHistoryIngestionCursor } from "./position-history-ingestion-cursor.types";

const transactionTimeoutMs = 30_000;
const cursorSelect = Object.freeze({ vehicleId: true, coverageFrom: true, confirmedThrough: true, createdAt: true, updatedAt: true });

function assertFiniteDate(value: Date): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new PositionHistoryIngestionCursorInvalidAdvanceError();
}

@Injectable()
export class PrismaPositionHistoryIngestionCursorRepository implements PositionHistoryIngestionCursorRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async ensureCursor(vehicleId: string, policyFloor: Date): Promise<VehicleHistoryIngestionCursor> {
    assertFiniteDate(policyFloor);
    const client = this.database.getClient();
    const vehicle = await client.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
    if (vehicle === null) throw new PositionHistoryIngestionCursorVehicleNotFoundError();
    return client.vehicleHistoryIngestionCursor.upsert({
      where: { vehicleId: vehicle.id },
      create: { vehicleId: vehicle.id, coverageFrom: policyFloor, confirmedThrough: policyFloor },
      update: {},
      select: cursorSelect,
    });
  }

  public async findCursor(vehicleId: string): Promise<VehicleHistoryIngestionCursor | null> {
    return this.database.getClient().vehicleHistoryIngestionCursor.findUnique({ where: { vehicleId }, select: cursorSelect });
  }

  public async persistContiguousResult(input: PersistContiguousHistoryResultInput): Promise<PersistContiguousHistoryResult> {
    assertFiniteDate(input.expectedConfirmedThrough);
    assertFiniteDate(input.nextConfirmedThrough);
    if (input.nextConfirmedThrough.getTime() <= input.expectedConfirmedThrough.getTime()) throw new PositionHistoryIngestionCursorInvalidAdvanceError();

    const client = this.database.getClient();
    return client.$transaction(async (transaction) => {
      const rows: Prisma.VehiclePositionObservationCreateManyInput[] = input.candidates.map((candidate) => ({ vehicleId: input.vehicleId, ...candidate }));
      const inserted = rows.length === 0 ? 0 : (await transaction.vehiclePositionObservation.createMany({ data: rows, skipDuplicates: true })).count;
      const advanced = await transaction.vehicleHistoryIngestionCursor.updateMany({
        where: { vehicleId: input.vehicleId, confirmedThrough: input.expectedConfirmedThrough },
        data: { confirmedThrough: input.nextConfirmedThrough },
      });
      if (advanced.count !== 1) throw new PositionHistoryIngestionCursorStaleProgressError();
      return Object.freeze({ inserted, duplicates: rows.length - inserted });
    }, { timeout: transactionTimeoutMs });
  }
}
