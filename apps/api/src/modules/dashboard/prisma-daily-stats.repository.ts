import { Injectable } from "@nestjs/common";
import { DailyStatSource, DataQuality } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import type { DailyStatsRepository } from "./daily-stats.repository";
import { DailyRunsConfigurationError, type DailyRunsPersistenceResult, type DailyRunsSnapshot } from "./dashboard.types";

const transactionTimeoutMs = 30_000;

function serviceDateValue(serviceDate: string): Date { return new Date(`${serviceDate}T00:00:00.000Z`); }

@Injectable()
export class PrismaDailyStatsRepository implements DailyStatsRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async getTimezone(): Promise<string> {
    const settings = await this.database.getClient().applicationSettings.findUnique({ where: { id: 1 }, select: { timezone: true } });
    if (!settings) throw new DailyRunsConfigurationError();
    return settings.timezone;
  }

  public async persistRunsSnapshot(snapshot: DailyRunsSnapshot): Promise<DailyRunsPersistenceResult> {
    const client = this.database.getClient();
    return client.$transaction(async (transaction) => {
      const vehicles = await transaction.vehicle.findMany({ select: { id: true, externalDeviceId: true, disabled: true } });
      const vehiclesByExternalId = new Map(vehicles.map((vehicle) => [vehicle.externalDeviceId, vehicle]));
      const matched = snapshot.runs.filter((run) => vehiclesByExternalId.has(run.externalDeviceId));
      const vehicleIds = matched.map((run) => vehiclesByExternalId.get(run.externalDeviceId)?.id).filter((id): id is string => id !== undefined);
      const date = serviceDateValue(snapshot.serviceDate);
      const existing = await transaction.dailyVehicleStat.findMany({ where: { serviceDate: date, vehicleId: { in: vehicleIds } }, select: { id: true, vehicleId: true, source: true, quality: true } });
      const existingByVehicleId = new Map(existing.map((stat) => [stat.vehicleId, stat]));
      let dailyStatsUpserted = 0;
      let protectedExactStats = 0;
      for (const run of matched) {
        const vehicle = vehiclesByExternalId.get(run.externalDeviceId);
        if (!vehicle) continue;
        const stat = existingByVehicleId.get(vehicle.id);
        if (!stat) {
          await transaction.dailyVehicleStat.create({ data: { vehicleId: vehicle.id, serviceDate: date, distanceMeters: run.distanceMeters, movementDurationSeconds: null, maxSpeedKph: null, source: DailyStatSource.RUNS, quality: DataQuality.PROVISIONAL, isStale: false, isDegraded: false, fetchedAt: snapshot.fetchedAt } });
          dailyStatsUpserted += 1;
          continue;
        }
        if (stat.quality === DataQuality.EXACT) { protectedExactStats += 1; continue; }
        const update = stat.quality === DataQuality.PROVISIONAL && stat.source !== DailyStatSource.RUNS
          ? { distanceMeters: run.distanceMeters, source: DailyStatSource.RUNS, quality: DataQuality.PROVISIONAL, isStale: false, isDegraded: false, fetchedAt: snapshot.fetchedAt }
          : { distanceMeters: run.distanceMeters, movementDurationSeconds: null, maxSpeedKph: null, source: DailyStatSource.RUNS, quality: DataQuality.PROVISIONAL, isStale: false, isDegraded: false, fetchedAt: snapshot.fetchedAt };
        await transaction.dailyVehicleStat.update({ where: { id: stat.id }, data: update });
        dailyStatsUpserted += 1;
      }
      return { dailyStatsUpserted, vehiclesWithoutRun: vehicles.filter((vehicle) => !matched.some((run) => run.externalDeviceId === vehicle.externalDeviceId)).length, unmatchedRuns: snapshot.runs.length - matched.length, protectedExactStats };
    }, { timeout: transactionTimeoutMs });
  }
}
