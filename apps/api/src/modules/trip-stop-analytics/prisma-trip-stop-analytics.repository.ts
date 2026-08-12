import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import type { StoredTripStopAnalyticsSnapshot, TripStopAnalyticsRange, TripStopAnalyticsRepository } from "./trip-stop-analytics.types";

const readTransactionTimeoutMs = 30_000;

@Injectable()
export class PrismaTripStopAnalyticsRepository implements TripStopAnalyticsRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async getSnapshot(vehicleId: string, range: TripStopAnalyticsRange): Promise<StoredTripStopAnalyticsSnapshot> {
    return this.database.getClient().$transaction(async (transaction) => {
      const vehicle = await transaction.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true, name: true } });
      if (vehicle === null) return Object.freeze({ vehicle: null, observations: Object.freeze([]) });
      const observations = await transaction.vehiclePositionObservation.findMany({
        where: { vehicleId, observedAt: { gte: range.from, lte: range.to } },
        orderBy: [{ observedAt: "asc" }, { fixFingerprint: "asc" }],
        select: { observedAt: true, fixFingerprint: true, latitude: true, longitude: true, speedKph: true, valid: true, outdated: true },
      });
      return Object.freeze({ vehicle: Object.freeze(vehicle), observations: Object.freeze(observations.map((observation) => Object.freeze(observation))) });
    }, { timeout: readTransactionTimeoutMs, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}

