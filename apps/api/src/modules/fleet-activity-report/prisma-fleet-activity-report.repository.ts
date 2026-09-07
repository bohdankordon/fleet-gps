import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import type { TripStopAnalyticsRange } from "../trip-stop-analytics";
import type { FleetActivityReportRepository, FleetActivitySnapshot } from "./fleet-activity-report.types";

const READ_TRANSACTION_TIMEOUT_MS = 30_000;

@Injectable()
export class PrismaFleetActivityReportRepository implements FleetActivityReportRepository {
  public constructor(private readonly database: DatabaseService) {}
  public async getSnapshot(range: TripStopAnalyticsRange): Promise<FleetActivitySnapshot> {
    return this.database.getClient().$transaction(async (transaction) => {
      const vehicles = await transaction.vehicle.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true } });
      const observations = await transaction.vehiclePositionObservation.findMany({
        // Reports owns a half-open day; Trips/History keep their own contracts.
        where: { observedAt: { gte: range.from, lt: range.to } },
        orderBy: [{ vehicleId: "asc" }, { observedAt: "asc" }, { fixFingerprint: "asc" }],
        select: { vehicleId: true, observedAt: true, fixFingerprint: true, latitude: true, longitude: true, speedKph: true, valid: true, outdated: true },
      });
      return Object.freeze({ vehicles: Object.freeze(vehicles.map((vehicle) => Object.freeze(vehicle))), observations: Object.freeze(observations.map((observation) => Object.freeze(observation))) });
    }, { timeout: READ_TRANSACTION_TIMEOUT_MS, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
