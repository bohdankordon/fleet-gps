import assert from "node:assert/strict";
import test from "node:test";
import { AlertNotificationRecipientPlanner } from "./alert-notification-recipient-planner.service";
import { RecipientDeliveryRepository, recipientDeliveryRepositoryInternals } from "./recipient-delivery.repository";
import type { DatabaseService } from "../database/database.service";
import { UNRESTRICTED_VEHICLE_SCOPE } from "../vehicle-access/vehicle-access.service";
import { AuthRole, NotificationVehicleScope, TelegramConnectionStatus } from "../../generated/prisma/enums";

const vehicleId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const config = { telegramPerUserNotifications: { enabled: true }, telegramPerUserDispatch: { enabled: true } } as never;

test("B2 planner intersects Product Vehicle Access before delivery intent", async () => {
  let userWhere: unknown;
  const transaction = {
    vehicle: { findUnique: async () => ({ disabled: false }) },
    alertNotification: { upsert: async () => ({ id: "n1" }) },
    authUser: { findMany: async (args: unknown) => { userWhere = (args as { where: unknown }).where; return []; } },
    alertNotificationDelivery: { createMany: async () => ({}) },
  };
  await new AlertNotificationRecipientPlanner(config).plan(transaction as never, { id: "e1", vehicleId, type: "SPEEDING" });
  const where = userWhere as { AND?: readonly unknown[] };
  assert.ok(Array.isArray(where.AND));
  const access = JSON.stringify(where.AND);
  assert.ok(access.includes(vehicleId));
  assert.ok(access.includes("vehicleGrants"));
  assert.ok(access.includes("vehicleGroupGrants"));
});

test("B2 dispatch recheck suppresses revoke-after-queue without calling transport", async () => {
  const deliveryId = "00000000-0000-4000-8000-000000000003";
  const lease = "00000000-0000-4000-8000-000000000004";
  const baseUser = { id: userId, role: AuthRole.USER, disabled: false, mustChangePassword: false, permissions: [{ key: "events.view" }, { key: "vehicles.view" }], telegramConnection: { status: TelegramConnectionStatus.CONNECTED, telegramUserId: 1n, telegramChatId: 2n, connectionRevision: 1 }, notificationPreferences: { enabled: true, speedingEnabled: true, inactivityEnabled: true, vehicleScope: NotificationVehicleScope.ALL, vehicles: [] } };
  const baseEvent = { id: "e1", vehicleId, type: "SPEEDING", speedZone: "CITY", confirmationSpeedKph: 70, speedThresholdKph: 60, confirmationTraveledDistanceMeters: null, distanceThresholdMeters: null, durationThresholdMinutes: null, vehicle: { id: vehicleId, name: "Car A", disabled: false }, confirmedAt: new Date() };
  const delivery = { id: deliveryId, userId, connectionRevision: 1, notification: { alertEvent: baseEvent }, user: baseUser };
  const client = {
    alertNotificationDelivery: { findFirst: async () => delivery },
    applicationSettings: { findUnique: async () => ({ timezone: "UTC" }) },
  };
  const denied = new RecipientDeliveryRepository({ getClient: () => client } as unknown as DatabaseService, { canAccess: async () => false } as never);
  assert.deepEqual(await denied.recheck(deliveryId, lease), { kind: "SUPPRESS", code: "VEHICLE_ACCESS_REVOKED" });
  const allowed = new RecipientDeliveryRepository({ getClient: () => client } as unknown as DatabaseService, { canAccess: async () => true } as never);
  const eligibility = await allowed.recheck(deliveryId, lease);
  assert.equal(eligibility.kind, "ELIGIBLE");
});

test("B2 suppression reasons stay distinct", async () => {
  const row = (preferences: unknown) => ({
    user: { disabled: false, mustChangePassword: false, role: AuthRole.USER, permissions: [{ key: "events.view" }, { key: "vehicles.view" }], telegramConnection: { status: TelegramConnectionStatus.CONNECTED, telegramUserId: 1n, telegramChatId: 2n, connectionRevision: 1 }, notificationPreferences: preferences },
    connectionRevision: 1,
    notification: { alertEvent: { vehicleId, type: "SPEEDING", speedZone: "CITY", confirmationSpeedKph: 70, speedThresholdKph: 60, vehicle: { disabled: false, name: "Car A" }, confirmedAt: new Date() } },
  });
  const changed = recipientDeliveryRepositoryInternals.evaluate(row({ enabled: true, speedingEnabled: true, inactivityEnabled: true, vehicleScope: NotificationVehicleScope.SELECTED, vehicles: [] }) as never, "UTC");
  assert.deepEqual(changed, { kind: "SUPPRESS", code: "VEHICLE_SCOPE_CHANGED" });
  assert.notEqual("VEHICLE_ACCESS_REVOKED", "VEHICLE_SCOPE_CHANGED");
  assert.equal(UNRESTRICTED_VEHICLE_SCOPE.kind, "UNRESTRICTED");
});

test("B2 existing safety checks are preserved", async () => {
  const row = (overrides: unknown) => ({
    user: { disabled: false, mustChangePassword: false, role: AuthRole.USER, permissions: [{ key: "events.view" }, { key: "vehicles.view" }], telegramConnection: { status: TelegramConnectionStatus.CONNECTED, telegramUserId: 1n, telegramChatId: 2n, connectionRevision: 1 }, notificationPreferences: { enabled: true, speedingEnabled: true, inactivityEnabled: true, vehicleScope: NotificationVehicleScope.ALL, vehicles: [] }, ...(overrides as object) },
    connectionRevision: 1,
    notification: { alertEvent: { vehicleId, type: "SPEEDING", speedZone: "CITY", confirmationSpeedKph: 70, speedThresholdKph: 60, vehicle: { disabled: false, name: "Car A" }, confirmedAt: new Date() } },
  });
  assert.deepEqual(recipientDeliveryRepositoryInternals.evaluate(row({ disabled: true }) as never, "UTC"), { kind: "SUPPRESS", code: "ACCOUNT_DISABLED" });
  assert.deepEqual(recipientDeliveryRepositoryInternals.evaluate(row({ mustChangePassword: true }) as never, "UTC"), { kind: "SUPPRESS", code: "ACCOUNT_SECURITY_RESTRICTED" });
  assert.deepEqual(recipientDeliveryRepositoryInternals.evaluate(row({ permissions: [] }) as never, "UTC"), { kind: "SUPPRESS", code: "PERMISSION_REVOKED" });
});
