import assert from "node:assert/strict";
import test from "node:test";
import { AlertEventsContractError, parseAlertEventsListResponse, parseAlertEventsSummaryResponse, parseSpeedingEventInvestigation } from "./alert-events-contract";
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

test("speeding investigation accepts deterministic durable segments and legacy empty evidence", () => {
  const base = { eventId: "00000000-0000-4000-8000-000000000001", type: "SPEEDING", vehicleId: "00000000-0000-4000-8000-000000000002", confirmedAt: "2026-09-16T10:00:02.000Z", confirmationPosition: { latitude: 49.2, longitude: 28.4 }, confirmationSpeedKph: 72, thresholdKph: 60, zone: "CITY", speedingSegments: [] };
  assert.deepEqual(parseSpeedingEventInvestigation(base).speedingSegments, []);
  const speedingSegments = [{ startedAt: "2026-09-16T10:00:00.000Z", startPosition: { latitude: 49.1, longitude: 28.3 }, confirmedAt: "2026-09-16T10:00:02.000Z", lastSpeedingObservedAt: "2026-09-16T10:00:05.000Z", lastSpeedingPosition: { latitude: 49.3, longitude: 28.5 } }];
  assert.deepEqual(parseSpeedingEventInvestigation({ ...base, speedingSegments }).speedingSegments, speedingSegments);
});

test("speeding investigation fails closed for malformed or reversed segment evidence", () => {
  const base = { eventId: "00000000-0000-4000-8000-000000000001", type: "SPEEDING", vehicleId: "00000000-0000-4000-8000-000000000002", confirmedAt: "2026-09-16T10:00:02.000Z", confirmationPosition: null, confirmationSpeedKph: 72, thresholdKph: 60, zone: "CITY", speedingSegments: [] };
  const valid = { startedAt: "2026-09-16T10:00:00.000Z", startPosition: { latitude: 49.1, longitude: 28.3 }, confirmedAt: "2026-09-16T10:00:02.000Z", lastSpeedingObservedAt: "2026-09-16T10:00:05.000Z", lastSpeedingPosition: { latitude: 49.3, longitude: 28.5 } };
  for (const malformed of [{ ...valid, startPosition: { latitude: 91, longitude: 28.3 } }, { ...valid, startedAt: "2026-09-16T10:00:03.000Z" }, { ...valid, lastSpeedingObservedAt: "2026-09-16T10:00:01.000Z" }, { ...valid, secret: true }]) assert.throws(() => parseSpeedingEventInvestigation({ ...base, speedingSegments: [malformed] }), AlertEventsContractError);
});
