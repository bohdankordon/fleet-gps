import { Inject, Injectable } from "@nestjs/common";
import { analyzeTripStopObservations, TripStopAnalyticsPolicyService, type TripStopAnalyticsObservation, type TripStopAnalyticsRange } from "../trip-stop-analytics";
import { VehicleScopeService } from "../vehicle-access/vehicle-access.service";
import { FLEET_ACTIVITY_REPORT_REPOSITORY } from "./fleet-activity-report.tokens";
import { FLEET_ACTIVITY_REPORT_MAX_RANGE_MS, type FleetActivityReport, type FleetActivityReportRepository, type FleetActivityVehicleRow } from "./fleet-activity-report.types";

function sum(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0); }

@Injectable()
export class FleetActivityReportService {
  public constructor(@Inject(FLEET_ACTIVITY_REPORT_REPOSITORY) private readonly repository: FleetActivityReportRepository, private readonly policy: TripStopAnalyticsPolicyService, private readonly scopes: VehicleScopeService) {}

  public async getReport(range: TripStopAnalyticsRange, userId: string, generatedAt = new Date()): Promise<FleetActivityReport> {
    const from = range.from.getTime(); const to = range.to.getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to || to - from > FLEET_ACTIVITY_REPORT_MAX_RANGE_MS || !Number.isFinite(generatedAt.getTime())) throw new Error("Invalid report range or generation time");
    const scope = await this.scopes.resolve(userId);
    const [snapshot, context] = await Promise.all([this.repository.getSnapshot(range, scope), this.policy.getReportContext()]);
    const grouped = new Map<string, TripStopAnalyticsObservation[]>();
    for (const observation of snapshot.observations) {
      // Enforce Reports' half-open boundary before the unchanged inclusive core.
      if (observation.observedAt.getTime() < from || observation.observedAt.getTime() >= to) continue;
      const group = grouped.get(observation.vehicleId) ?? [];
      group.push(observation); grouped.set(observation.vehicleId, group);
    }
    const vehicles: FleetActivityVehicleRow[] = snapshot.vehicles.map((vehicle) => {
      // At midnight the report interval is empty. The shared core intentionally
      // requires a positive range, so no core call or synthetic interval is used.
      const analytics = from === to ? null : analyzeTripStopObservations(grouped.get(vehicle.id) ?? [], range, context.policy);
      const rawObservationCount = analytics?.rawObservationCount ?? 0;
      return Object.freeze({
        vehicleId: vehicle.id, vehicleName: vehicle.name, group: vehicle.group ? Object.freeze({ id: vehicle.group.id, name: vehicle.group.name, color: vehicle.group.color }) : null, hasGpsData: rawObservationCount > 0, rawObservationCount,
        firstObservationAt: analytics?.firstObservationAt ?? null, lastObservationAt: analytics?.lastObservationAt ?? null,
        tripCount: analytics?.trips.length ?? 0, observedDistanceMeters: analytics?.totalObservedTripDistanceMeters ?? 0,
        tripDurationSeconds: sum(analytics?.trips.map((trip) => trip.durationSeconds) ?? []),
        stopCount: analytics?.stops.length ?? 0, stopDurationSeconds: sum(analytics?.stops.map((stop) => stop.durationSeconds) ?? []),
        gapCount: analytics?.gaps.length ?? 0, gapDurationSeconds: sum(analytics?.gaps.map((gap) => gap.durationSeconds) ?? []),
      });
    });
    vehicles.sort((left, right) => Number(right.hasGpsData) - Number(left.hasGpsData) || right.observedDistanceMeters - left.observedDistanceMeters || left.vehicleId.localeCompare(right.vehicleId));
    const vehiclesWithGps = vehicles.filter((vehicle) => vehicle.hasGpsData).length;
    return Object.freeze({
      from: new Date(range.from), to: new Date(range.to), generatedAt: new Date(generatedAt), timezone: context.timezone, policy: context.policy,
      summary: Object.freeze({
        vehicleCount: vehicles.length, vehiclesWithGps, vehicleWithoutGpsCount: vehicles.length - vehiclesWithGps,
        tripCount: sum(vehicles.map((vehicle) => vehicle.tripCount)), totalObservedDistanceMeters: sum(vehicles.map((vehicle) => vehicle.observedDistanceMeters)),
        totalTripDurationSeconds: sum(vehicles.map((vehicle) => vehicle.tripDurationSeconds)), gapCount: sum(vehicles.map((vehicle) => vehicle.gapCount)),
        totalGapDurationSeconds: sum(vehicles.map((vehicle) => vehicle.gapDurationSeconds)),
      }),
      vehicles: Object.freeze(vehicles),
    });
  }
}
