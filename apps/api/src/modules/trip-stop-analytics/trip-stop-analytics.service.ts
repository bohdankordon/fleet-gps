import { Inject, Injectable } from "@nestjs/common";
import { analyzeTripStopObservations } from "./trip-stop-analytics.core";
import { TRIP_STOP_ANALYTICS_MAX_RANGE_MS } from "./trip-stop-analytics.constants";
import { TripStopAnalyticsTargetError, TripStopAnalyticsVehicleNotFoundError } from "./trip-stop-analytics.errors";
import { TRIP_STOP_ANALYTICS_REPOSITORY } from "./trip-stop-analytics.tokens";
import type { TripStopAnalysisResult, TripStopAnalyticsRange, TripStopAnalyticsRepository } from "./trip-stop-analytics.types";
import { TripStopAnalyticsPolicyService } from "./trip-stop-analytics-policy.service";

function validTarget(vehicleId: string, range: TripStopAnalyticsRange): boolean {
  const from = range.from.getTime();
  const to = range.to.getTime();
  return vehicleId.length > 0 && Number.isFinite(from) && Number.isFinite(to) && from < to && to - from <= TRIP_STOP_ANALYTICS_MAX_RANGE_MS;
}

@Injectable()
export class TripStopAnalyticsService {
  public constructor(@Inject(TRIP_STOP_ANALYTICS_REPOSITORY) private readonly repository: TripStopAnalyticsRepository, private readonly policy: TripStopAnalyticsPolicyService) {}

  public async analyze(vehicleId: string, range: TripStopAnalyticsRange): Promise<TripStopAnalysisResult> {
    if (!validTarget(vehicleId, range)) throw new TripStopAnalyticsTargetError();
    const [snapshot, policy] = await Promise.all([this.repository.getSnapshot(vehicleId, range), this.policy.getSnapshot()]);
    if (snapshot.vehicle === null) throw new TripStopAnalyticsVehicleNotFoundError();
    const core = analyzeTripStopObservations(snapshot.observations, range, policy);
    return Object.freeze({
      vehicle: Object.freeze({ ...snapshot.vehicle }),
      range: core.range,
      summary: Object.freeze({
        rawObservationCount: core.rawObservationCount,
        continuitySegmentCount: core.continuitySegmentCount,
        tripCount: core.trips.length,
        stopCount: core.stops.length,
        gapCount: core.gaps.length,
        totalObservedTripDistanceMeters: core.totalObservedTripDistanceMeters,
        firstObservationAt: core.firstObservationAt,
        lastObservationAt: core.lastObservationAt,
      }),
      trips: core.trips,
      stops: core.stops,
      gaps: core.gaps,
    });
  }
}
