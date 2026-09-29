import assert from "node:assert/strict";
import test from "node:test";
import { RecipientDeliveryDispatcherService } from "./recipient-delivery-dispatcher.service";
import { AlertNotificationMessageFormatter } from "./alert-notification-message.formatter";
import type { RecipientAlertMessageSource } from "./recipient-delivery.types";

const vehicleId = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";
const base = { chatId: 123n, vehicleName: "Car A", timezone: "UTC", confirmedAt: new Date("2026-09-29T12:00:00Z") };
const speeding: RecipientAlertMessageSource = { ...base, alertType: "SPEEDING", eventId, vehicleId, canViewTrips: true, speedZone: "CITY", confirmationSpeedKph: 70, speedThresholdKph: 60 };
const inactivity: RecipientAlertMessageSource = { ...base, alertType: "INACTIVITY", confirmationTraveledDistanceMeters: 2, distanceThresholdMeters: 100, durationThresholdMinutes: 15 };

async function dispatch(source: RecipientAlertMessageSource) {
  const sent: unknown[] = [];
  const delivery = { id: eventId, notificationId: eventId, userId: vehicleId, connectionRevision: 1, leaseToken: vehicleId, attemptCount: 0, createdAt: new Date() };
  let claims = 0;
  const repository = { expireOverAge: async () => {}, claimNext: async () => claims++ === 0 ? [delivery] : [], recheck: async () => ({ kind: "ELIGIBLE", source }), markSent: async () => {} };
  const transport = { sendAlertConfirmed: async (...args: unknown[]) => { sent.push(args); } };
  const service = new RecipientDeliveryDispatcherService(repository as never, new AlertNotificationMessageFormatter(), transport as never, { publicSiteOrigin: "https://fleet.example.test", telegramPerUserDispatch: { enabled: true } } as never);
  assert.equal((await service.dispatchBatch(1)).sent, 1);
  return sent[0] as [bigint, string, { button: { text: string; url: string } } | undefined];
}

test("authorized SPEEDING sends unchanged body plus exact Trips event action", async () => {
  const [chat, body, action] = await dispatch(speeding);
  assert.equal(chat, 123n);
  assert.equal(body, new AlertNotificationMessageFormatter().formatAlertConfirmed(speeding));
  assert.ok(action);
  assert.equal(action.button.text, "Відкрити в Fleet GPS");
  const url = new URL(action.button.url);
  assert.equal(url.origin, "https://fleet.example.test");
  assert.equal(url.pathname, `/vehicles/${vehicleId}/trips`);
  assert.equal(url.searchParams.get("event"), eventId);
  assert.ok(Date.parse(url.searchParams.get("from")!) <= speeding.confirmedAt.getTime());
  assert.ok(Date.parse(url.searchParams.get("to")!) >= speeding.confirmedAt.getTime());
  for (const forbidden of ["123", "bot-token", "session-token", "delivery-id", "provider-secret"]) assert.equal(url.toString().includes(forbidden), false);
});

test("SPEEDING without Trips access still sends the same text without action", async () => {
  const [, body, action] = await dispatch({ ...speeding, canViewTrips: false });
  assert.equal(body, new AlertNotificationMessageFormatter().formatAlertConfirmed(speeding));
  assert.equal(action, undefined);
});

test("INACTIVITY remains text only", async () => {
  const [, body, action] = await dispatch(inactivity);
  assert.equal(body, new AlertNotificationMessageFormatter().formatAlertConfirmed(inactivity));
  assert.equal(action, undefined);
});
