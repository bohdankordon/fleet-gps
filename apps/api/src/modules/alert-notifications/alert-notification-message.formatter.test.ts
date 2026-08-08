import assert from "node:assert/strict";
import test from "node:test";
import type { ClaimedAlertNotification } from "./alert-notification-outbox.types";
import { AlertNotificationMessageFormatter } from "./alert-notification-message.formatter";

const base = Object.freeze({
  id: "00000000-0000-4000-8000-000000000101",
  alertEventId: "00000000-0000-4000-8000-000000000102",
  kind: "ALERT_CONFIRMED" as const,
  status: "SENDING" as const,
  createdAt: new Date("2026-08-08T09:59:00.000Z"),
  availableAt: new Date("2026-08-08T09:59:00.000Z"),
  lockedAt: new Date("2026-08-08T10:01:00.000Z"),
  lockToken: "00000000-0000-4000-8000-000000000103",
  attemptCount: 1,
  lastAttemptAt: new Date("2026-08-08T10:01:00.000Z"),
  vehicleName: "Taxi Alpha",
  timezone: "Europe/Kyiv",
  confirmedAt: new Date("2026-08-08T10:00:00.000Z"),
});

function assertSafe(message: string): void {
  for (const forbidden of [base.id, base.alertEventId, base.lockToken, "987654321", "49.2328", "28.4810"]) assert.equal(message.includes(forbidden), false);
}

test("formats a CITY speeding snapshot with vehicle, Kyiv time, speed, and threshold", () => {
  const source = { ...base, alertType: "SPEEDING", speedZone: "CITY", confirmationSpeedKph: 72.5, speedThresholdKph: 60, externalDeviceId: 987654321, latitude: 49.2328, longitude: 28.481 } as const;
  const message = new AlertNotificationMessageFormatter().formatAlertConfirmed(source);
  assert.match(message, /🚨 Перевищення швидкості/);
  assert.match(message, /Taxi Alpha/);
  assert.match(message, /CITY/);
  assert.match(message, /72[,.]5 км\/год/);
  assert.match(message, /60 км\/год/);
  assert.match(message, /13:00/);
  assertSafe(message);
});

test("formats an OUTSIDE_CITY speeding snapshot", () => {
  const notification: ClaimedAlertNotification = { ...base, alertType: "SPEEDING", speedZone: "OUTSIDE_CITY", confirmationSpeedKph: 101, speedThresholdKph: 100 };
  const message = new AlertNotificationMessageFormatter().formatAlertConfirmed(notification);
  assert.match(message, /OUTSIDE_CITY/);
  assert.match(message, /101 км\/год/);
  assert.match(message, /100 км\/год/);
  assertSafe(message);
});

test("formats an inactivity confirmation snapshot and safely falls back for a blank vehicle name", () => {
  const notification: ClaimedAlertNotification = { ...base, vehicleName: "   ", alertType: "INACTIVITY", confirmationTraveledDistanceMeters: 12.5, distanceThresholdMeters: 300, durationThresholdMinutes: 60 };
  const message = new AlertNotificationMessageFormatter().formatAlertConfirmed(notification);
  assert.match(message, /⚠️ Тривалий простій/);
  assert.match(message, /Транспортний засіб/);
  assert.match(message, /60 хв/);
  assert.match(message, /300 м/);
  assert.match(message, /12[,.]5 м/);
  assert.match(message, /13:00/);
  assertSafe(message);
});
