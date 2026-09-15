import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database";
import { applyVehicleScope } from "../vehicle-access/vehicle-access.service";
import type { VehicleScope } from "../vehicle-access/vehicle-access.types";
import { MAX_TRACK_POINTS, type StoredVehicleTrackSnapshot, type VehicleTrackQueryRepository } from "./vehicle-track-query.repository";

const readTransactionTimeoutMs = 10_000;

@Injectable()
export class PrismaVehicleTrackQueryRepository implements VehicleTrackQueryRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async getSnapshot(vehicleId: string, from: Date, to: Date, scope: VehicleScope): Promise<StoredVehicleTrackSnapshot> {
    return this.database.getClient().$transaction(async (transaction) => {
      const vehicle = await transaction.vehicle.findFirst({ where: applyVehicleScope(scope, { id: vehicleId }), select: { id: true, name: true } });
      if (!vehicle) return { vehicle: null, points: [] };
      const points = await transaction.vehiclePositionObservation.findMany({
        where: { vehicleId, observedAt: { gte: from, lte: to } },
        orderBy: [{ observedAt: "asc" }, { fixFingerprint: "asc" }],
        take: MAX_TRACK_POINTS + 1,
        select: { observedAt: true, latitude: true, longitude: true, speedKph: true, valid: true, outdated: true },
      });
      return { vehicle, points };
    }, { timeout: readTransactionTimeoutMs, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
