import assert from "node:assert/strict";
import test from "node:test";
import { alertDetailsLabel, alertStatusLabel, alertTypeLabel, alertZoneLabel, formatAlertDistance, formatAlertSpeed, formatAlertTimestamp, notificationDeliveryLabel } from "./alert-events-formatters";
import { alertEventsListFixture } from "./alert-events-fixture";

test("formats Kyiv timestamps and persisted speed/distance details", () => {
  assert.match(formatAlertTimestamp("2026-08-08T12:00:00.000Z"), /15:00/);
  assert.equal(formatAlertTimestamp(null), "Нет данных"); assert.equal(formatAlertSpeed(72), "72 км/ч"); assert.equal(formatAlertDistance(300), "300 м");
  assert.match(alertDetailsLabel(alertEventsListFixture.items[0]), /Город/);
});
test("maps public type, status, zone, and delivery enums to Russian labels", () => {
  assert.equal(alertTypeLabel("SPEEDING"), "Превышение скорости"); assert.equal(alertTypeLabel("INACTIVITY"), "Неактивность"); assert.equal(alertStatusLabel("OPEN"), "Открыто"); assert.equal(alertStatusLabel("RESOLVED"), "Завершено"); assert.equal(alertZoneLabel("OUTSIDE_CITY"), "За городом");
  assert.deepEqual(["NONE", "PENDING", "SENT", "FAILED"].map((value) => notificationDeliveryLabel(value as "NONE")), ["Не отправлялось", "Ожидает отправки", "Отправлено", "Ошибка доставки"]);
});
