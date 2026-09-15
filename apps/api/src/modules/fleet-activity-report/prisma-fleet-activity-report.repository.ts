import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { applyObservationScope, applyVehicleScope } from "../vehicle-access/vehicle-access.service";
import type { VehicleScope } from "../vehicle-access/vehicle-access.types";
import type { TripStopAnalyticsRange } from "../trip-stop-analytics";
import type { FleetActivityReportRepository, FleetActivitySnapshot } from "./fleet-activity-report.types";

const READ_TRANSACTION_TIMEOUT_MS = 30_000;

@Injectable()
export class PrismaFleetActivityReportRepository implements FleetActivityReportRepository {
  public constructor(private readonly database: DatabaseService) {}
  public async getSnapshot(range: TripStopAnalyticsRange, scope: VehicleScope): Promise<FleetActivitySnapshot> {
    return this.database.getClient().$transaction(async (transaction) => {
      const stored = await transaction.vehicle.findMany({ where: applyVehicleScope(scope), orderBy: { id: "asc" }, select: { id: true, name: true, group: { select: { id: true, name: true, color: true } } } });
      const vehicles = stored.map((vehicle) => ({ id: vehicle.id, name: vehicle.name, group: vehicle.group ? { id: vehicle.group.id, name: vehicle.group.name, color: vehicle.group.color } : null }));
      const observations = await transaction.vehiclePositionObservation.findMany({
        // Reports owns a half-open day; Trips/History keep their own contracts.
        where: applyObservationScope(scope, { observedAt: { gte: range.from, lt: range.to } }),
        orderBy: [{ vehicleId: "asc" }, { observedAt: "asc" }, { fixFingerprint: "asc" }],
        select: { vehicleId: true, observedAt: true, fixFingerprint: true, latitude: true, longitude: true, speedKph: true, valid: true, outdated: true },
      });
      return Object.freeze({ vehicles: Object.freeze(vehicles.map((vehicle) => Object.freeze(vehicle))), observations: Object.freeze(observations.map((observation) => Object.freeze(observation))) });
    }, { timeout: READ_TRANSACTION_TIMEOUT_MS, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
