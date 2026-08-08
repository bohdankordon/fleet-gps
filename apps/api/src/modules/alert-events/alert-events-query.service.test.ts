import assert from "node:assert/strict";
import test from "node:test";
import { AlertEventSpeedZone, AlertEventStatus, AlertEventType, AlertNotificationStatus } from "../../generated/prisma/client";
import type { AlertEventsQueryParams } from "./alert-events-query-params";
import type { AlertEventsQueryRepository, StoredAlertEventReadRow } from "./alert-events-query.repository";
import { AlertEventsQueryService } from "./alert-events-query.service";

const VEHICLE_ID = "00000000-0000-4000-8000-000000000001";
const EVENT_ID = "00000000-0000-4000-8000-000000000002";
const AT = new Date("2026-08-08T10:00:00.000Z");
const params: AlertEventsQueryParams = { status: undefined, type: undefined, vehicleId: undefined, limit: 50, cursor: undefined };

function row(overrides: Partial<StoredAlertEventReadRow> = {}): StoredAlertEventReadRow {
  return {
    id: EVENT_ID, type: AlertEventType.SPEEDING, status: AlertEventStatus.OPEN, confirmedAt: AT, resolvedAt: null,
    speedZone: AlertEventSpeedZone.CITY, confirmationSpeedKph: 72, lastSpeedKph: 75, peakSpeedKph: 81, speedThresholdKph: 60,
    confirmationTraveledDistanceMeters: null, lastTraveledDistanceMeters: null, minimumTraveledDistanceMeters: null, distanceThresholdMeters: null, durationThresholdMinutes: null,
    vehicle: { id: VEHICLE_ID, name: "Taxi 7" }, notificationOutbox: [], ...overrides,
  };
}

function service(rows: readonly StoredAlertEventReadRow[], hasMore = false, summary = { speeding: 0, inactivity: 0 }): { subject: AlertEventsQueryService; calls: { lists: number; summaries: number } } {
  const calls = { lists: 0, summaries: 0 };
  const repository: AlertEventsQueryRepository = {
    list: async () => { calls.lists += 1; return { rows, hasMore }; },
    getOpenSummary: async () => { calls.summaries += 1; return summary; },
  };
  return { subject: new AlertEventsQueryService(repository), calls };
}

test("returns the valid empty alert-events page", async () => {
  const { subject, calls } = service([]);
  assert.deepEqual(await subject.list(params), { items: [], nextCursor: null });
  assert.deepEqual(calls, { lists: 1, summaries: 0 });
});

test("maps persisted SPEEDING and INACTIVITY snapshots without current settings", async () => {
  const inactivity = row({
    id: "00000000-0000-4000-8000-000000000003", type: AlertEventType.INACTIVITY, status: AlertEventStatus.RESOLVED, resolvedAt: new Date("2026-08-08T11:00:00.000Z"),
    speedZone: null, confirmationSpeedKph: null, lastSpeedKph: null, peakSpeedKph: null, speedThresholdKph: null,
    confirmationTraveledDistanceMeters: 12, lastTraveledDistanceMeters: 350, minimumTraveledDistanceMeters: 8, distanceThresholdMeters: 300, durationThresholdMinutes: 60,
  });
  const response = await service([row(), inactivity]).subject.list(params);
  assert.deepEqual(response.items[0], { id: EVENT_ID, vehicle: { id: VEHICLE_ID, name: "Taxi 7" }, type: "SPEEDING", status: "OPEN", openedAt: AT.toISOString(), resolvedAt: null, notificationDeliveryStatus: "NONE", details: { zone: "CITY", confirmationSpeedKph: 72, lastSpeedKph: 75, peakSpeedKph: 81, thresholdKph: 60 } });
  assert.deepEqual(response.items[1], { id: inactivity.id, vehicle: { id: VEHICLE_ID, name: "Taxi 7" }, type: "INACTIVITY", status: "RESOLVED", openedAt: AT.toISOString(), resolvedAt: "2026-08-08T11:00:00.000Z", notificationDeliveryStatus: "NONE", details: { confirmationDistanceMeters: 12, lastDistanceMeters: 350, minimumDistanceMeters: 8, distanceThresholdMeters: 300, durationThresholdMinutes: 60 } });
});

test("maps PENDING and internal SENDING to the stable PENDING delivery state", async () => {
  for (const status of [AlertNotificationStatus.PENDING, AlertNotificationStatus.SENDING]) {
    const response = await service([row({ notificationOutbox: [{ status }] })]).subject.list(params);
    assert.equal(response.items[0]?.notificationDeliveryStatus, "PENDING");
  }
});

test("maps SENT, FAILED, and an event without outbox", async () => {
  const rows = [
    row({ id: "00000000-0000-4000-8000-000000000003", notificationOutbox: [{ status: AlertNotificationStatus.SENT }] }),
    row({ id: "00000000-0000-4000-8000-000000000004", notificationOutbox: [{ status: AlertNotificationStatus.FAILED }] }),
    row({ id: "00000000-0000-4000-8000-000000000005", notificationOutbox: [] }),
  ];
  const response = await service(rows).subject.list(params);
  assert.deepEqual(response.items.map((item) => item.notificationDeliveryStatus), ["SENT", "FAILED", "NONE"]);
});

test("creates nextCursor only from the last returned event in a non-final page", async () => {
  const last = row({ id: "00000000-0000-4000-8000-000000000009", confirmedAt: new Date("2026-08-08T09:00:00.000Z") });
  const response = await service([row(), last], true).subject.list(params);
  assert.notEqual(response.nextCursor, null);
  assert.deepEqual(response.nextCursor === null ? undefined : (await import("./alert-events-query-params")).parseAlertEventsQueryParams({ cursor: response.nextCursor }).cursor, { openedAt: last.confirmedAt, id: last.id });
  assert.equal((await service([row()], false).subject.list(params)).nextCursor, null);
});

test("public serialization contains no internal or sensitive fields", async () => {
  const json = JSON.stringify(await service([row({ notificationOutbox: [{ status: AlertNotificationStatus.FAILED }] })]).subject.list(params));
  for (const forbidden of ["externalDeviceId", "latitude", "longitude", "dedupeKey", "activeKey", "lockToken", "lockedAt", "attemptCount", "availableAt", "lastError", "lastErrorCode", "telegram", "provider", "confirmationReceipts", "observations"]) {
    assert.equal(json.includes(forbidden), false, forbidden);
  }
});

test("returns zero and mixed OPEN summary counts", async () => {
  assert.deepEqual(await service([]).subject.getSummary(), { open: { total: 0, speeding: 0, inactivity: 0 } });
  const mixed = service([], false, { speeding: 3, inactivity: 2 });
  assert.deepEqual(await mixed.subject.getSummary(), { open: { total: 5, speeding: 3, inactivity: 2 } });
  assert.deepEqual(mixed.calls, { lists: 0, summaries: 1 });
});
