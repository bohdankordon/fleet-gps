import { Inject, Injectable } from "@nestjs/common";
import { analyzeTripStopObservations, type TripStopAnalyticsObservation, type TripStopAnalyticsRange } from "../trip-stop-analytics";
import { FLEET_ACTIVITY_REPORT_REPOSITORY } from "./fleet-activity-report.tokens";
import type { FleetActivityReport, FleetActivityReportRepository, FleetActivityVehicleRow } from "./fleet-activity-report.types";

function sum(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0); }

@Injectable()
export class FleetActivityReportService {
  public constructor(@Inject(FLEET_ACTIVITY_REPORT_REPOSITORY) private readonly repository: FleetActivityReportRepository) {}
  public async getReport(range: TripStopAnalyticsRange): Promise<FleetActivityReport> {
    const snapshot = await this.repository.getSnapshot(range);
    const grouped = new Map<string, TripStopAnalyticsObservation[]>();
    for (const observation of snapshot.observations) { const group = grouped.get(observation.vehicleId) ?? []; group.push(observation); grouped.set(observation.vehicleId, group); }
    const vehicles: FleetActivityVehicleRow[] = snapshot.vehicles.map((vehicle) => {
      const analytics = analyzeTripStopObservations(grouped.get(vehicle.id) ?? [], range);
      return Object.freeze({ vehicleId: vehicle.id, vehicleName: vehicle.name, hasGpsData: analytics.rawObservationCount > 0, rawObservationCount: analytics.rawObservationCount, tripCount: analytics.trips.length, observedDistanceMeters: analytics.totalObservedTripDistanceMeters, tripDurationSeconds: sum(analytics.trips.map((trip) => trip.durationSeconds)), stopCount: analytics.stops.length, stopDurationSeconds: sum(analytics.stops.map((stop) => stop.durationSeconds)), gapCount: analytics.gaps.length });
    });
    vehicles.sort((left, right) => Number(right.hasGpsData) - Number(left.hasGpsData) || right.observedDistanceMeters - left.observedDistanceMeters || left.vehicleId.localeCompare(right.vehicleId));
    const vehiclesWithGps = vehicles.filter((vehicle) => vehicle.hasGpsData).length;
    return Object.freeze({ from: new Date(range.from), to: new Date(range.to), summary: Object.freeze({ vehicleCount: vehicles.length, vehiclesWithGps, vehicleWithoutGpsCount: vehicles.length - vehiclesWithGps, tripCount: sum(vehicles.map((vehicle) => vehicle.tripCount)), totalObservedDistanceMeters: sum(vehicles.map((vehicle) => vehicle.observedDistanceMeters)), totalTripDurationSeconds: sum(vehicles.map((vehicle) => vehicle.tripDurationSeconds)), gapCount: sum(vehicles.map((vehicle) => vehicle.gapCount)) }), vehicles: Object.freeze(vehicles) });
  }
}
