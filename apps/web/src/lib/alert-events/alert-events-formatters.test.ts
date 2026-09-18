import assert from "node:assert/strict";
import test from "node:test";
import { alertStatusLabel, alertTypeLabel, alertZoneLabel, formatAlertDistance, formatAlertSpeed, formatAlertTimestamp, notificationDeliveryLabel } from "./alert-events-formatters";

test("formats Kyiv timestamps and persisted speed/distance details", () => {
  assert.match(formatAlertTimestamp("2026-08-08T12:00:00.000Z", "ru"), /15:00/);
  assert.equal(formatAlertTimestamp(null, "ru"), "Нет данных"); assert.equal(formatAlertSpeed(72, "ru"), "72 км/ч"); assert.equal(formatAlertDistance(300, "ru"), "300 м");
});
test("maps public type, status, zone, and delivery enums to Russian labels", () => {
  assert.equal(alertTypeLabel("SPEEDING", "ru"), "Превышение скорости"); assert.equal(alertTypeLabel("INACTIVITY", "ru"), "Неактивность"); assert.equal(alertStatusLabel("OPEN", "ru"), "Открыто"); assert.equal(alertStatusLabel("RESOLVED", "ru"), "Завершено"); assert.equal(alertZoneLabel("OUTSIDE_CITY", "ru"), "За городом");
  assert.deepEqual(["NONE", "PENDING", "SENT", "FAILED"].map((value) => notificationDeliveryLabel(value as "NONE", "ru")), ["Не отправлялось", "Ожидает отправки", "Отправлено", "Ошибка доставки"]);
});
