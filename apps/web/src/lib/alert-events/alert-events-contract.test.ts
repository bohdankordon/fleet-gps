import assert from "node:assert/strict";
import test from "node:test";
import { AlertEventsContractError, parseAlertEventsListResponse, parseAlertEventsSummaryResponse } from "./alert-events-contract";
import { alertEventsListFixture, alertEventsSummaryFixture } from "./alert-events-fixture";

test("validates empty, SPEEDING, and INACTIVITY Stage 8A public alert-event contracts", () => {
  assert.deepEqual(parseAlertEventsListResponse({ items: [], nextCursor: null }), { items: [], nextCursor: null });
  assert.equal(parseAlertEventsListResponse(alertEventsListFixture).items[0]?.type, "SPEEDING");
  const inactivity = { ...alertEventsListFixture, items: [{ id: "00000000-0000-4000-8000-000000000003", vehicle: { id: "00000000-0000-4000-8000-000000000002", name: "Такси 8", group: null }, type: "INACTIVITY", status: "RESOLVED", openedAt: "2026-08-08T12:00:00.000Z", lastObservedAt: "2026-08-08T12:25:00.000Z", resolvedAt: "2026-08-08T13:00:00.000Z", notificationDeliveryStatus: "SENT", details: { confirmationDistanceMeters: 20, lastDistanceMeters: 40, minimumDistanceMeters: 12, distanceThresholdMeters: 300, durationThresholdMinutes: 60 } }] };
  assert.equal(parseAlertEventsListResponse(inactivity).items[0]?.type, "INACTIVITY");
});

test("rejects invalid alert enums, timestamps, metrics, and unexpected/sensitive fields", () => {
  const item = alertEventsListFixture.items[0];
  for (const invalid of [{ ...alertEventsListFixture, items: [{ ...item, status: "ACTIVE" }] }, { ...alertEventsListFixture, items: [{ ...item, openedAt: "not-a-time" }] }, { ...alertEventsListFixture, items: [{ ...item, details: { ...item.details, peakSpeedKph: -1 } }] }, { ...alertEventsListFixture, items: [{ ...item, lockToken: "secret" }] }]) assert.throws(() => parseAlertEventsListResponse(invalid), AlertEventsContractError);
});

test("validates zero and mixed summary counts and rejects invalid counts", () => {
  assert.deepEqual(parseAlertEventsSummaryResponse({ open: { total: 0, speeding: 0, inactivity: 0 } }), { open: { total: 0, speeding: 0, inactivity: 0 } });
  assert.deepEqual(parseAlertEventsSummaryResponse(alertEventsSummaryFixture), alertEventsSummaryFixture);
  assert.throws(() => parseAlertEventsSummaryResponse({ open: { total: -1, speeding: 0, inactivity: 0 } }), AlertEventsContractError);
});

test("lastObservedAt is required and timestamp validated", () => {
  for (const lastObservedAt of [undefined, null, "yesterday"]) assert.throws(() => parseAlertEventsListResponse({ ...alertEventsListFixture, items: [{ ...alertEventsListFixture.items[0], lastObservedAt }] }), AlertEventsContractError);
  assert.equal(parseAlertEventsListResponse(alertEventsListFixture).items[0]?.lastObservedAt, "2026-08-08T12:05:00.000Z");
});
