export const VEHICLE_DETAILS_FIXTURE = {
  generatedAt: "2026-08-10T12:00:00.000Z", vehicle: { id: "00000000-0000-4000-8000-000000000001", name: "Taxi GPS VEHICLE DETAILS TEST", disabled: false, group: null },
  connectivity: "ONLINE",
  currentState: { position: { latitude: 49.23, longitude: 28.46, observedAt: "2026-08-10T11:59:00.000Z" }, speedKph: 42.5, freshness: "FRESH" },
  today: { date: "2026-08-10", distanceMeters: 12345.67, movementDurationSeconds: 5400, maxSpeedKph: 88.1, source: "RUNS", quality: "PROVISIONAL", isStale: false, isDegraded: false },
  activeAlerts: [{ type: "SPEEDING", openedAt: "2026-08-10T11:00:00.000Z" }, { type: "INACTIVITY", openedAt: "2026-08-10T10:00:00.000Z" }],
  recentEvents: [{ id: "00000000-0000-4000-8000-000000000002", type: "SPEEDING", status: "OPEN", openedAt: "2026-08-10T11:00:00.000Z", resolvedAt: null, notificationDeliveryStatus: "PENDING", details: { zone: "CITY", confirmationSpeedKph: 72, lastSpeedKph: 75, peakSpeedKph: 82, thresholdKph: 60 } }, { id: "00000000-0000-4000-8000-000000000003", type: "INACTIVITY", status: "RESOLVED", openedAt: "2026-08-10T09:00:00.000Z", resolvedAt: "2026-08-10T10:00:00.000Z", notificationDeliveryStatus: "SENT", details: { confirmationDistanceMeters: 12, lastDistanceMeters: 16, minimumDistanceMeters: 8, distanceThresholdMeters: 300, durationThresholdMinutes: 60 } }],
} as const;
