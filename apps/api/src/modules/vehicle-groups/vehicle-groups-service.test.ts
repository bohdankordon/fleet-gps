import assert from "node:assert/strict";
import test from "node:test";
import { AuditEventType } from "../../generated/prisma/enums";
import type { DatabaseService } from "../database/database.service";
import { buildUserActor, parseAuditEventSpec } from "../audit/audit-events";
import { VehicleGroupsError, VehicleGroupsService } from "./vehicle-groups.service";

const GROUP_ID = "00000000-0000-4000-8000-000000000001";
const ACTOR = buildUserActor("00000000-0000-4000-8000-000000000099", "operator");
const AT = new Date("2026-09-15T12:00:00.000Z");

function storedGroup(overrides: Record<string, unknown> = {}) {
  return { id: GROUP_ID, name: "Taxi", color: "BLUE", vehicles: [], _count: { vehicles: 0, userGrants: 0 }, createdAt: AT, updatedAt: AT, ...overrides };
}

function harness(hooks: { group?: Record<string, unknown> | null; rawRows?: readonly unknown[]; createFails?: unknown; updateFails?: unknown } = {}) {
  const calls = { create: [] as unknown[], update: [] as unknown[], vehicleUpdateMany: [] as unknown[], raw: 0 };
  const audits = [] as unknown[];
  let group: Record<string, unknown> | null = hooks.group === undefined ? storedGroup() : hooks.group;
  const transaction = {
    $queryRaw: async () => { calls.raw += 1; return hooks.rawRows ?? [{ id: GROUP_ID }]; },
    vehicleGroup: {
      create: async (args: unknown) => {
        calls.create.push(args);
        if (hooks.createFails) throw hooks.createFails;
        const data = (args as { data: Record<string, unknown> }).data;
        return { ...storedGroup(), ...data, vehicles: [], _count: { vehicles: 0, userGrants: 0 } };
      },
      findUnique: async () => group,
      update: async (args: unknown) => {
        calls.update.push(args);
        if (hooks.updateFails) throw hooks.updateFails;
        const data = (args as { data: Record<string, unknown> }).data;
        group = { ...(group as Record<string, unknown>), ...data };
        return group;
      },
    },
    vehicle: {
      findMany: async () => [],
      updateMany: async (args: unknown) => { calls.vehicleUpdateMany.push(args); return { count: 0 }; },
    },
  };
  const client = { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(transaction) };
  const audit = { append: async (_tx: unknown, spec: unknown) => { audits.push(spec); return {}; } };
  const service = new VehicleGroupsService({ getClient: () => client } as unknown as DatabaseService, audit as never);
  return { service, calls, audits };
}

test("create persists name and color atomically with a color-carrying audit event", async () => {
  const { service, calls, audits } = harness();
  const created = await service.create(ACTOR, { name: "  Night  ", color: "GREEN" });
  assert.equal(created.name, "Night");
  assert.equal(created.color, "GREEN");
  assert.equal(calls.create.length, 1);
  assert.equal(audits.length, 1);
  const recorded = parseAuditEventSpec(audits[0]);
  assert.equal(recorded.eventType, AuditEventType.VEHICLE_GROUP_CREATED);
  assert.deepEqual((recorded as { details: unknown }).details, { name: "Night", color: "GREEN" });
});

test("create rejects missing, invalid, and extra color input without writes", async () => {
  for (const body of [{ name: "Taxi" }, { name: "Taxi", color: "RED" }, { name: "Taxi", color: "blue" }, { name: "Taxi", color: "" }, { name: "Taxi", color: null }, { name: "Taxi", color: "GREEN", extra: 1 }, { name: "", color: "BLUE" }, "Taxi", null]) {
    const { service, calls, audits } = harness();
    await assert.rejects(service.create(ACTOR, body), VehicleGroupsError);
    assert.deepEqual(calls.create, []);
    assert.deepEqual(audits, []);
  }
});

test("create maps duplicate names without auditing", async () => {
  const { service, audits } = harness({ createFails: { code: "P2002" } });
  await assert.rejects(service.create(ACTOR, { name: "Taxi", color: "BLUE" }), (error: unknown) => error instanceof VehicleGroupsError && error.code === "DUPLICATE_NAME");
  assert.deepEqual(audits, []);
});

test("updateDetails edits name only, color only, or both with truthful audit events", async () => {
  const renamed = await harness().service.updateDetails(ACTOR, GROUP_ID, { name: "City Taxi" });
  assert.equal(renamed.name, "City Taxi");
  assert.equal(renamed.color, "BLUE");
  const recolored = await harness().service.updateDetails(ACTOR, GROUP_ID, { color: "PURPLE" });
  assert.equal(recolored.name, "Taxi");
  assert.equal(recolored.color, "PURPLE");
  const both = await harness().service.updateDetails(ACTOR, GROUP_ID, { name: "City Taxi", color: "GOLD" });
  assert.equal(both.name, "City Taxi");
  assert.equal(both.color, "GOLD");
});

test("updateDetails color-only change keeps membership and grant reads untouched", async () => {
  const { service, calls, audits } = harness({ group: storedGroup({ vehicles: [{ id: "v1", name: "Car", externalDeviceId: 7, disabled: false }], _count: { vehicles: 1, userGrants: 2 } }) });
  const result = await service.updateDetails(ACTOR, GROUP_ID, { color: "CYAN" });
  assert.equal(result.color, "CYAN");
  assert.deepEqual(result.vehicles.map((vehicle) => vehicle.id), ["v1"]);
  assert.deepEqual(calls.vehicleUpdateMany, []);
  assert.equal(audits.length, 1);
  const recorded = parseAuditEventSpec(audits[0]);
  assert.equal(recorded.eventType, AuditEventType.VEHICLE_GROUP_UPDATED);
  assert.deepEqual((recorded as { details: unknown }).details, { previousName: "Taxi", name: "Taxi", previousColor: "BLUE", color: "CYAN" });
});

test("updateDetails rejects empty, unknown, and invalid input and no-ops without auditing", async () => {
  for (const body of [{}, { shade: "BLUE" }, { name: "Taxi", color: "RED" }, { color: "rainbow" }, { name: "" }, "Taxi", null]) {
    const { service, calls, audits } = harness();
    await assert.rejects(service.updateDetails(ACTOR, GROUP_ID, body), VehicleGroupsError);
    assert.deepEqual(calls.update, []);
    assert.deepEqual(audits, []);
  }
  const same = harness();
  const unchanged = await same.service.updateDetails(ACTOR, GROUP_ID, { name: "Taxi", color: "BLUE" });
  assert.equal(unchanged.name, "Taxi");
  assert.equal(unchanged.color, "BLUE");
  assert.deepEqual(same.calls.update, []);
  assert.deepEqual(same.audits, []);
});

test("updateDetails fails closed for unknown groups and duplicate names", async () => {
  const missing = harness({ rawRows: [] });
  await assert.rejects(missing.service.updateDetails(ACTOR, GROUP_ID, { color: "GREEN" }), (error: unknown) => error instanceof VehicleGroupsError && error.code === "NOT_FOUND");
  const duplicate = harness({ updateFails: { code: "P2002" } });
  await assert.rejects(duplicate.service.updateDetails(ACTOR, GROUP_ID, { name: "Taken" }), (error: unknown) => error instanceof VehicleGroupsError && error.code === "DUPLICATE_NAME");
  assert.deepEqual(duplicate.audits, []);
});
