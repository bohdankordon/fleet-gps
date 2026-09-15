import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { applyVehicleScope } from "../vehicle-access/vehicle-access.service";
import type { VehicleScope } from "../vehicle-access/vehicle-access.types";
import { DailyRunsConfigurationError } from "./dashboard.types";
import type { DashboardQueryRepository, DashboardSettings, DashboardStoredVehicle } from "./dashboard-query.repository";

const readTransactionTimeoutMs = 10_000;
function serviceDateValue(serviceDate: string): Date { return new Date(`${serviceDate}T00:00:00.000Z`); }

@Injectable()
export class PrismaDashboardQueryRepository implements DashboardQueryRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async getSettings(): Promise<DashboardSettings> {
    const settings = await this.database.getClient().applicationSettings.findUnique({ where: { id: 1 }, select: { timezone: true, minimumDailyDistanceMeters: true, positionFreshnessSeconds: true } });
    if (!settings) throw new DailyRunsConfigurationError();
    return settings;
  }

  public async getVehiclesForServiceDate(serviceDate: string, scope: VehicleScope): Promise<readonly DashboardStoredVehicle[]> {
    const date = serviceDateValue(serviceDate);
    return this.database.getClient().$transaction((transaction) => transaction.vehicle.findMany({
      where: applyVehicleScope(scope),
      select: {
        id: true, name: true, disabled: true,
        group: { select: { id: true, name: true, color: true } },
        currentState: { select: { status: true, externalLastUpdateAt: true, fixTime: true, speedKph: true, valid: true, outdated: true } },
        dailyStats: { where: { serviceDate: date }, take: 1, select: { distanceMeters: true, source: true, quality: true, isStale: true, isDegraded: true } },
      },
    }).then((vehicles) => vehicles.map((vehicle) => ({ id: vehicle.id, name: vehicle.name, disabled: vehicle.disabled, group: vehicle.group ? { id: vehicle.group.id, name: vehicle.group.name, color: vehicle.group.color } : null, currentState: vehicle.currentState, dailyStat: vehicle.dailyStats[0] ?? null }))), { timeout: readTransactionTimeoutMs });
  }
}
