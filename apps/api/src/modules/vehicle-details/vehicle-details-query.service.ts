import { Inject, Injectable } from "@nestjs/common";
import { AlertEventType, DailyStatSource, DataQuality } from "../../generated/prisma/client";
import { projectOpenAlert, projectScopedAlertEvent } from "../alert-events/alert-event-read.projection";
import { projectFleetMapCurrentState } from "../fleet-map/fleet-map-current-state.projection";
import { VehicleScopeService } from "../vehicle-access/vehicle-access.service";
import { VEHICLE_DETAILS_CLOCK, VEHICLE_DETAILS_QUERY_REPOSITORY } from "./vehicle-details.tokens";
import type { VehicleDetailsQueryRepository, StoredVehicleDailyStat } from "./vehicle-details-query.repository";
import type { VehicleDetailsResponse, VehicleDetailsTodayReadModel } from "./vehicle-details-read-models";
import { VehicleDetailsNotFoundError, VehicleDetailsStateError, type VehicleDetailsClock } from "./vehicle-details.types";

function decimalToNumber(value: unknown, nullable = false): number | null {
  if (value === null && nullable) return null;
  const numberValue = typeof value === "number"
    ? value
    : typeof value === "object" && value !== null && "toNumber" in value && typeof value.toNumber === "function"
      ? value.toNumber()
      : Number.NaN;
  if (!Number.isFinite(numberValue) || numberValue < 0) throw new VehicleDetailsStateError();
  return numberValue;
}

function operationalDate(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new VehicleDetailsStateError();
  const date = value.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new VehicleDetailsStateError();
  return date;
}

function mapToday(date: Date, stat: StoredVehicleDailyStat | null): VehicleDetailsTodayReadModel | null {
  if (!stat) return null;
  if (stat.source !== DailyStatSource.RUNS && stat.source !== DailyStatSource.MODE1 && stat.source !== DailyStatSource.HISTORICAL_POSITIONS) throw new VehicleDetailsStateError();
  if (stat.quality !== DataQuality.EXACT && stat.quality !== DataQuality.PROVISIONAL && stat.quality !== DataQuality.ESTIMATED) throw new VehicleDetailsStateError();
  if (stat.movementDurationSeconds !== null && (!Number.isSafeInteger(stat.movementDurationSeconds) || stat.movementDurationSeconds < 0)) throw new VehicleDetailsStateError();
  return Object.freeze({
    date: operationalDate(date),
    distanceMeters: decimalToNumber(stat.distanceMeters) as number,
    movementDurationSeconds: stat.movementDurationSeconds,
    maxSpeedKph: decimalToNumber(stat.maxSpeedKph, true),
    source: stat.source,
    quality: stat.quality,
    isStale: stat.isStale,
    isDegraded: stat.isDegraded,
  });
}

function activeTypeOrder(type: "SPEEDING" | "INACTIVITY"): number {
  return type === "SPEEDING" ? 0 : 1;
}

@Injectable()
export class VehicleDetailsQueryService {
  public constructor(
    @Inject(VEHICLE_DETAILS_QUERY_REPOSITORY) private readonly repository: VehicleDetailsQueryRepository,
    @Inject(VEHICLE_DETAILS_CLOCK) private readonly clock: VehicleDetailsClock,
    private readonly scopes: VehicleScopeService,
  ) {}

  public async getDetails(vehicleId: string, userId: string): Promise<VehicleDetailsResponse> {
    const snapshot = await this.repository.getSnapshot(vehicleId, await this.scopes.resolve(userId));
    const generatedAt = this.clock.now();
    if (!(generatedAt instanceof Date) || !Number.isFinite(generatedAt.getTime())
      || !Number.isSafeInteger(snapshot.positionFreshnessSeconds) || snapshot.positionFreshnessSeconds <= 0
      || snapshot.activeAlertsExceededLimit) throw new VehicleDetailsStateError();
    if (!snapshot.vehicle) throw new VehicleDetailsNotFoundError();

    const activeAlerts = snapshot.activeAlerts
      .map((row) => projectOpenAlert(row.type, row.confirmedAt))
      .sort((left, right) => activeTypeOrder(left.type) - activeTypeOrder(right.type) || left.openedAt.localeCompare(right.openedAt));
    if (new Set(activeAlerts.map((alert) => alert.type)).size !== activeAlerts.length) throw new VehicleDetailsStateError();

    return Object.freeze({
      generatedAt: generatedAt.toISOString(),
      vehicle: Object.freeze({ id: snapshot.vehicle.id, name: snapshot.vehicle.name, disabled: snapshot.vehicle.disabled }),
      connectivity: snapshot.vehicle.currentState?.status ?? "UNKNOWN",
      currentState: projectFleetMapCurrentState(snapshot.vehicle.currentState, generatedAt, snapshot.positionFreshnessSeconds),
      today: mapToday(snapshot.serviceDate, snapshot.vehicle.dailyStat),
      activeAlerts: Object.freeze(activeAlerts),
      recentEvents: Object.freeze(snapshot.recentEvents.map(projectScopedAlertEvent)),
    });
  }
}

export const vehicleDetailsQueryServiceInternals = Object.freeze({ mapToday });
