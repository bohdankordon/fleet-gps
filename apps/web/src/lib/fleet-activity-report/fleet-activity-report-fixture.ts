import type { FleetActivityReportResponse } from "./fleet-activity-report-contract";
export function fleetActivityReportFixture(): FleetActivityReportResponse {
  return {
    from: "2026-08-09T21:00:00.000Z", to: "2026-08-10T21:00:00.000Z",
    generatedAt: "2026-08-12T10:30:00.000Z", timezone: "Europe/Kyiv",
    policy: { tripMovementSpeedKph: 5, tripMovementConfirmationSeconds: 60, tripStopConfirmationSeconds: 300, tripDataGapSeconds: 300 },
    summary: { vehicleCount: 2, vehiclesWithGps: 1, vehicleWithoutGpsCount: 1, tripCount: 2, totalObservedDistanceMeters: 12000, totalTripDurationSeconds: 3600, gapCount: 1, totalGapDurationSeconds: 600 },
    vehicles: [
      { vehicleId: "00000000-0000-4000-8000-000000000001", vehicleName: "Taxi A", group: null, hasGpsData: true, rawObservationCount: 20, firstObservationAt: "2026-08-10T05:00:00.000Z", lastObservationAt: "2026-08-10T10:00:00.000Z", tripCount: 2, observedDistanceMeters: 12000, tripDurationSeconds: 3600, stopCount: 1, stopDurationSeconds: 600, gapCount: 1, gapDurationSeconds: 600 },
      { vehicleId: "00000000-0000-4000-8000-000000000002", vehicleName: "Taxi B", group: null, hasGpsData: false, rawObservationCount: 0, firstObservationAt: null, lastObservationAt: null, tripCount: 0, observedDistanceMeters: 0, tripDurationSeconds: 0, stopCount: 0, stopDurationSeconds: 0, gapCount: 0, gapDurationSeconds: 0 },
    ],
  };
}
