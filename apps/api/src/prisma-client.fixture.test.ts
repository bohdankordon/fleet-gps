import assert from "node:assert/strict";
import test from "node:test";
import { AlertEventSpeedZone, AlertEventStatus, AlertEventType, AlertNotificationKind, AlertNotificationStatus, DataQuality, DailyStatSource, Prisma, PrismaClient, VehicleStatus } from "./generated/prisma/client";

function typecheckDelegates(client: PrismaClient): void { void client.vehicle; void client.vehicleCurrentState; void client.dailyVehicleStat; void client.applicationSettings; void client.alertEvent; void client.alertEventConfirmation; void client.alertNotificationOutbox; }

test("generated Prisma public client exposes expected API without a connection", () => {
  assert.equal(typeof PrismaClient, "function");
  assert.equal(typeof Prisma.Decimal, "function");
  assert.equal(VehicleStatus.ONLINE, "ONLINE");
  assert.equal(DailyStatSource.MODE1, "MODE1");
  assert.equal(DataQuality.EXACT, "EXACT");
  assert.equal(AlertEventType.SPEEDING, "SPEEDING");
  assert.equal(AlertEventStatus.RESOLVED, "RESOLVED");
  assert.equal(AlertEventSpeedZone.OUTSIDE_CITY, "OUTSIDE_CITY");
  assert.equal(AlertNotificationKind.ALERT_CONFIRMED, "ALERT_CONFIRMED");
  assert.equal(AlertNotificationStatus.PENDING, "PENDING");
  void typecheckDelegates;
});
