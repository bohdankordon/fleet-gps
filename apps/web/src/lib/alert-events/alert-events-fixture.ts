import type { AlertEventsListResponse, AlertEventsSummaryResponse } from "./alert-events-contract";

export const alertEventsListFixture = {
  items: [{ id: "00000000-0000-4000-8000-000000000001", vehicle: { id: "00000000-0000-4000-8000-000000000002", name: "Такси 7" }, type: "SPEEDING", status: "OPEN", openedAt: "2026-08-08T12:00:00.000Z", resolvedAt: null, notificationDeliveryStatus: "PENDING", details: { zone: "CITY", confirmationSpeedKph: 72, lastSpeedKph: 74, peakSpeedKph: 81, thresholdKph: 60 } }],
  nextCursor: "opaque-next-cursor",
} satisfies AlertEventsListResponse;
export const alertEventsSummaryFixture = { open: { total: 3, speeding: 2, inactivity: 1 } } satisfies AlertEventsSummaryResponse;
