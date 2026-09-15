import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseService } from "../database/database.service";
import { UNRESTRICTED_VEHICLE_SCOPE } from "../vehicle-access/vehicle-access.service";
import type { VehicleScope } from "../vehicle-access/vehicle-access.types";
import { NotificationPreferencesError, TelegramLinkingService } from "./telegram-linking.service";
import type { ApiConfig } from "../../config/api-config";
import type { AuditEventRepository } from "../audit";
import type { TelegramLinkRateLimiter } from "./telegram-link-rate-limiter";
import type { TelegramProductBotTransport } from "./telegram-product-bot.transport";

const userId = "00000000-0000-4000-8000-000000000001";
const vehicleA = "00000000-0000-4000-8000-0000000000a1";
const vehicleB = "00000000-0000-4000-8000-0000000000b2";
const vehicleD = "00000000-0000-4000-8000-0000000000d4";
const config = Object.freeze({ telegramProductLinking: Object.freeze({ enabled: true, botUsername: "Bot", botToken: "t", webhookSecret: "s" }) }) as ApiConfig;
const filteredScope: VehicleScope = { kind: "FILTERED", where: { OR: [{ accessGrants: { some: { userId } } }] } };

function linking(client: unknown, scope: VehicleScope | null) {
  const scopes = { resolve: async () => scope ?? UNRESTRICTED_VEHICLE_SCOPE } as never;
  return new TelegramLinkingService({ getClient: () => client } as unknown as DatabaseService, {} as AuditEventRepository, config, { check: () => true } as unknown as TelegramLinkRateLimiter, { sendHelp: async () => undefined, sendLinkSuccess: async () => undefined, sendLinkFailure: async () => undefined, sendAlertConfirmed: async () => undefined } as unknown as TelegramProductBotTransport, scopes);
}

test("B2 preferences read exposes only authorized vehicles", async () => {
  const authorized = [{ id: vehicleA, name: "Car A", disabled: false, groupId: null, groupName: null, groupColor: null }, { id: vehicleB, name: "Car B", disabled: false, groupId: null, groupName: null, groupColor: null }];
  let vehicleWhere: unknown;
  const client = {
    userNotificationPreferences: { findUnique: async () => null },
    vehicle: { findMany: async (args: unknown) => { vehicleWhere = args; return authorized; } },
  };
  const view = await linking(client, filteredScope).preferences(userId, ["vehicles.view"]);
  assert.deepEqual(view.vehicles, authorized);
  assert.ok(JSON.stringify(vehicleWhere).includes(userId));
  assert.equal(JSON.stringify(view).includes(vehicleD), false);
});

test("B2 hidden stored selections are dormant, preserved, and restorable", async () => {
  const authorized = [{ id: vehicleB, name: "Car B", disabled: false, groupId: null, groupName: null, groupColor: null }];
  const storedIds = [vehicleB, vehicleD];
  const client = {
    userNotificationPreferences: { findUnique: async () => ({ enabled: true, speedingEnabled: true, inactivityEnabled: true, vehicleScope: "SELECTED", revision: 1, vehicles: storedIds.map((vehicleId) => ({ vehicleId })) }) },
    vehicle: { findMany: async () => authorized },
  };
  const view = await linking(client, filteredScope).preferences(userId, ["vehicles.view"]);
  assert.deepEqual([...view.selectedVehicleIds], [vehicleB]);
  assert.equal(view.selectedVehicleIds.includes(vehicleD), false);
});

test("B2 cannot submit an unauthorized vehicle ID", async () => {
  const tx = {
    userNotificationPreferences: { findUnique: async () => ({ revision: 1 }), create: async () => { throw new Error("unexpected"); }, updateMany: async () => ({ count: 1 }) },
    vehicle: { count: async () => 0 },
    userNotificationVehicle: { findMany: async () => [], deleteMany: async () => ({}), createMany: async () => ({}) },
  };
  const client = { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx), userNotificationPreferences: { findUnique: async () => ({ enabled: true, speedingEnabled: true, inactivityEnabled: true, vehicleScope: "SELECTED", revision: 1, vehicles: [] }) }, vehicle: { findMany: async () => [] } };
  await assert.rejects(linking(client, filteredScope).updatePreferences(userId, ["vehicles.view"], { expectedRevision: 1, enabled: true, speedingEnabled: true, inactivityEnabled: true, vehicleScope: "SELECTED", selectedVehicleIds: [vehicleD] }), NotificationPreferencesError);
});

test("B2 updating visible preferences preserves dormant selections", async () => {
  const existing = [{ vehicleId: vehicleB }, { vehicleId: vehicleD }];
  const authorizedExisting = [{ vehicleId: vehicleB }];
  let created: unknown;
  const tx = {
    userNotificationPreferences: { findUnique: async () => ({ revision: 1 }), updateMany: async () => ({ count: 1 }) },
    vehicle: { count: async () => 1 },
    userNotificationVehicle: {
      findMany: async (args: unknown) => ((args as { where?: { vehicle?: unknown } }).where && (args as { where: { vehicle: unknown } }).where.vehicle ? authorizedExisting : existing),
      deleteMany: async () => ({}),
      createMany: async (args: unknown) => { created = args; return {}; },
    },
  };
  const client = { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx), userNotificationPreferences: { findUnique: async () => ({ enabled: true, speedingEnabled: true, inactivityEnabled: true, vehicleScope: "SELECTED", revision: 2, vehicles: [] }) }, vehicle: { findMany: async () => [{ id: vehicleA, name: "Car A", disabled: false }] } };
  await linking(client, filteredScope).updatePreferences(userId, ["vehicles.view"], { expectedRevision: 1, enabled: true, speedingEnabled: true, inactivityEnabled: true, vehicleScope: "SELECTED", selectedVehicleIds: [vehicleA] });
  const ids = ((created as { data: readonly { vehicleId: string }[] }).data.map((row) => row.vehicleId).sort());
  assert.deepEqual(ids, [vehicleA, vehicleD].sort());
});
test("B2 dormant-only SELECTED can still save unrelated settings", async () => {
  const existing = [{ vehicleId: vehicleD }];
  let created: unknown;
  let updatedScalars: unknown;
  const tx = {
    userNotificationPreferences: {
      findUnique: async () => ({ revision: 4 }),
      updateMany: async (args: unknown) => { updatedScalars = args; return { count: 1 }; },
    },
    vehicle: { count: async () => 0 },
    userNotificationVehicle: {
      findMany: async (args: unknown) => ((args as { where?: { vehicle?: unknown } }).where && (args as { where: { vehicle: unknown } }).where.vehicle ? [] : existing),
      deleteMany: async () => ({}),
      createMany: async (args: unknown) => { created = args; return {}; },
    },
  };
  const client = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    userNotificationPreferences: { findUnique: async () => ({ enabled: false, speedingEnabled: false, inactivityEnabled: true, vehicleScope: "SELECTED", revision: 5, vehicles: existing }) },
    vehicle: { findMany: async () => [] },
  };
  const view = await linking(client, filteredScope).updatePreferences(userId, ["vehicles.view"], { expectedRevision: 4, enabled: false, speedingEnabled: false, inactivityEnabled: true, vehicleScope: "SELECTED", selectedVehicleIds: [] });
  assert.equal(view.enabled, false);
  assert.equal(view.vehicleScope, "SELECTED");
  assert.deepEqual([...view.selectedVehicleIds], []);
  assert.equal(view.hasDormantSelections, true);
  const ids = ((created as { data: readonly { vehicleId: string }[] }).data.map((row) => row.vehicleId));
  assert.deepEqual(ids, [vehicleD]);
});

test("B2 genuinely new SELECTED with no selections remains invalid", async () => {
  const tx = {
    userNotificationPreferences: { findUnique: async () => ({ revision: 1 }), updateMany: async () => ({ count: 1 }) },
    vehicle: { count: async () => 0 },
    userNotificationVehicle: { findMany: async () => [], deleteMany: async () => ({}), createMany: async () => ({}) },
  };
  const client = { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx), userNotificationPreferences: { findUnique: async () => null }, vehicle: { findMany: async () => [] } };
  await assert.rejects(linking(client, filteredScope).updatePreferences(userId, ["vehicles.view"], { expectedRevision: 1, enabled: true, speedingEnabled: true, inactivityEnabled: true, vehicleScope: "SELECTED", selectedVehicleIds: [] }), NotificationPreferencesError);
});
