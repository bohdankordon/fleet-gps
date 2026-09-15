import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { AuthRole, VehicleAccessMode } from "../../generated/prisma/enums";
import type { AuditUserActor } from "../audit";
import type { DatabaseService } from "../database/database.service";
import { ADMIN_CARDINALITY_ADVISORY_LOCK_KEY, AdminUsersError, AdminUsersService, DEFAULT_ADMIN_USER_SECURITY, type AdminUserSecurity } from "./admin-users.service";
import { PERMISSIONS } from "./permissions";
import { hashPassword, verifyPassword } from "./password";

const now = new Date("2026-08-12T12:00:00.000Z");
const actorId = "00000000-0000-4000-8000-000000000001";
const targetId = "00000000-0000-4000-8000-000000000002";
const otherId = "00000000-0000-4000-8000-000000000003";
const adminAId = "00000000-0000-4000-8000-000000000004";
const adminBId = "00000000-0000-4000-8000-000000000005";
const managerId = "00000000-0000-4000-8000-000000000006";

function actor(id = actorId, login = "admin.operator"): AuditUserActor {
  return Object.freeze({ actorType: "USER", actorUserId: id, actorLoginSnapshot: login });
}

type Row = {
  id: string;
  login: string;
  normalizedLogin: string;
  role: AuthRole;
  vehicleAccessMode: VehicleAccessMode;
  disabled: boolean;
  mustChangePassword: boolean;
  passwordHashVersion: number;
  passwordSalt: Uint8Array;
  passwordHash: Uint8Array;
  passwordChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const row = (id: string, role: AuthRole, disabled = false, login = id): Row => ({
  id,
  login,
  normalizedLogin: login.toLowerCase(),
  role,
  vehicleAccessMode: VehicleAccessMode.ALL,
  disabled,
  mustChangePassword: false,
  passwordHashVersion: 1,
  passwordSalt: new Uint8Array([1]),
  passwordHash: new Uint8Array([2]),
  passwordChangedAt: null,
  createdAt: now,
  updatedAt: now,
});

type AuditOverride = Readonly<{ append(client: unknown, event: unknown): Promise<unknown> }>;

function fixture(
  initial: readonly Row[] = [row(actorId, AuthRole.ADMIN), row(targetId, AuthRole.USER)],
  securityOverride?: AdminUserSecurity,
  auditOverride?: AuditOverride,
) {
  const users = new Map(initial.map((user) => [user.id, { ...user }]));
  const permissionRows = new Map<string, string[]>(initial.map((user) => [user.id, user.role === AuthRole.USER ? ["reports.view"] : []]));
  const sessions = new Map<string, string[]>(initial.map((user) => [user.id, [`${user.id}-session`]]));
  const dbArguments: unknown[] = [];
  const hashes: string[] = [];
  const auditEvents: unknown[] = [];
  const auditClients: unknown[] = [];
  let generated = 0;
  let locks = 0;
  let activeLock: Promise<void> = Promise.resolve();
  let activeTransaction: Promise<void> = Promise.resolve();

  const audit = auditOverride ?? {
    append: async (client: unknown, event: unknown) => {
      auditClients.push(client);
      auditEvents.push(event);
      return { id: `audit-${auditEvents.length}` };
    },
  };
  const withPermissions = (user: Row) => ({ ...user, permissions: (permissionRows.get(user.id) ?? []).map((key) => ({ key })), vehicleGroupGrants: [], vehicleGrants: [] });

  function transaction() {
    let release: (() => void) | undefined;
    return {
      $executeRaw: async () => {
        const previous = activeLock;
        activeLock = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        locks += 1;
        return 1;
      },
      authUser: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          dbArguments.push(data);
          if ([...users.values()].some((user) => user.normalizedLogin === data.normalizedLogin)) throw Object.assign(new Error("database duplicate details"), { code: "P2002" });
          const id = `00000000-0000-4000-8000-${String(users.size + 100).padStart(12, "0")}`;
          const created = { ...row(id, data.role as AuthRole, false, data.login as string), ...data, id, createdAt: now, updatedAt: now, passwordChangedAt: null } as Row;
          users.set(id, created);
          permissionRows.set(id, []);
          sessions.set(id, []);
          return withPermissions(created);
        },
        findUnique: async ({ where }: { where: { id: string } }) => {
          const user = users.get(where.id);
          return user ? withPermissions(user) : null;
        },
        findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
          const user = users.get(where.id);
          if (!user) throw new Error("missing");
          return withPermissions(user);
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
          dbArguments.push(data);
          const user = users.get(where.id);
          if (!user) throw new Error("missing");
          Object.assign(user, data, { updatedAt: now });
          return withPermissions(user);
        },
        count: async () => [...users.values()].filter((user) => user.role === AuthRole.ADMIN && !user.disabled).length,
      },
      authUserPermission: {
        deleteMany: async ({ where }: { where: { userId: string } }) => { permissionRows.set(where.userId, []); },
        createMany: async ({ data }: { data: { userId: string; key: string }[] }) => {
          for (const item of data) permissionRows.set(item.userId, [...(permissionRows.get(item.userId) ?? []), item.key]);
        },
      },
      authUserVehicleGroupGrant: { deleteMany: async () => {}, createMany: async () => {} },
      authUserVehicleGrant: { deleteMany: async () => {}, createMany: async () => {} },
      vehicleGroup: { findMany: async () => [] },
      vehicle: { findMany: async () => [] },
      authSession: { deleteMany: async ({ where }: { where: { userId: string } }) => { sessions.set(where.userId, []); } },
      release: () => release?.(),
    };
  }

  const snapshot = () => ({
    users: new Map([...users].map(([id, value]) => [id, { ...value, passwordSalt: new Uint8Array(value.passwordSalt), passwordHash: new Uint8Array(value.passwordHash) }])),
    permissions: new Map([...permissionRows].map(([id, value]) => [id, [...value]])),
    sessions: new Map([...sessions].map(([id, value]) => [id, [...value]])),
  });
  const restore = (before: ReturnType<typeof snapshot>) => {
    users.clear(); for (const [id, value] of before.users) users.set(id, value);
    permissionRows.clear(); for (const [id, value] of before.permissions) permissionRows.set(id, value);
    sessions.clear(); for (const [id, value] of before.sessions) sessions.set(id, value);
  };
  const client = {
    authUser: {
      findMany: async () => [...users.values()].sort((a, b) => a.normalizedLogin.localeCompare(b.normalizedLogin)).map(withPermissions),
      findUnique: async ({ where }: { where: { id: string } }) => { const user = users.get(where.id); return user ? withPermissions(user) : null; },
    },
    $transaction: async (callback: (tx: ReturnType<typeof transaction>) => Promise<unknown>) => {
      const previousTransaction = activeTransaction;
      let releaseTransaction: (() => void) | undefined;
      activeTransaction = new Promise<void>((resolve) => { releaseTransaction = resolve; });
      await previousTransaction;
      const tx = transaction();
      const before = snapshot();
      try { return await callback(tx); }
      catch (error) { restore(before); throw error; }
      finally { tx.release(); releaseTransaction?.(); }
    },
  };
  const security: AdminUserSecurity = {
    generatePassword: () => { generated += 1; return `${"A".repeat(23)}${generated}`; },
    hashPassword: async (password) => { hashes.push(password); return { version: 1, salt: new Uint8Array([7, 8]), hash: new Uint8Array([9, 10]) }; },
  };
  return {
    service: new AdminUsersService({ getClient: () => client } as unknown as DatabaseService, securityOverride ?? security, audit as never),
    users,
    permissions: permissionRows,
    sessions,
    dbArguments,
    hashes,
    auditEvents,
    auditClients,
    locks: () => locks,
  };
}

test("USER creation commits factual canonical audit details without the generated secret", async () => {
  const state = fixture();
  const result = await state.service.create(actor(), { login: "Dispatcher.1", role: "USER", permissions: ["trips.view"], vehicleAccess: { mode: "ALL", groupIds: [], vehicleIds: [] } });
  assert.deepEqual(result.user.permissions, ["vehicles.view", "trips.view"]);
  assert.deepEqual(state.hashes, [result.temporaryPassword]);
  assert.equal(JSON.stringify(state.dbArguments).includes(result.temporaryPassword), false);
  assert.equal(state.auditEvents.length, 2);
  assert.deepEqual(state.auditEvents[0], {
    eventType: "USER_CREATED",
    actor: actor(),
    targetType: "USER",
    targetId: result.user.id,
    details: { targetLoginSnapshot: "Dispatcher.1", role: "USER", permissions: ["vehicles.view", "trips.view"] },
  });
  assert.equal((state.auditClients[0] as { authUser?: unknown }).authUser !== undefined, true);
  assert.equal(JSON.stringify(state.auditEvents[0]).includes(result.temporaryPassword), false);
  assert.deepEqual(state.auditEvents[1], {
    eventType: "USER_VEHICLE_ACCESS_CHANGED",
    actor: actor(),
    targetType: "USER",
    targetId: result.user.id,
    details: { targetLoginSnapshot: "Dispatcher.1", previousMode: null, mode: "ALL", previousGroupGrantCount: 0, groupGrantCount: 0, previousVehicleGrantCount: 0, vehicleGrantCount: 0, addedGroupGrantCount: 0, removedGroupGrantCount: 0, addedVehicleGrantCount: 0, removedVehicleGrantCount: 0 },
  });
});

test("ADMIN creation audits effective full access while persisting zero permission rows", async () => {
  const state = fixture();
  const result = await state.service.create(actor(), { login: "Second.Admin", role: "ADMIN", permissions: [] });
  assert.deepEqual(state.permissions.get(result.user.id), []);
  assert.deepEqual((state.auditEvents[0] as { details: { permissions: readonly string[] } }).details.permissions, PERMISSIONS);
  assert.equal(state.locks(), 1);
});

test("create audit failure rolls back user and permission rows; conflicts and invalid input write zero audit", async () => {
  const failed = fixture(undefined, undefined, { append: async () => { throw new Error("audit failure"); } });
  const before = failed.users.size;
  await assert.rejects(failed.service.create(actor(), { login: "New.User", role: "USER", permissions: ["trips.view"], vehicleAccess: { mode: "ALL", groupIds: [], vehicleIds: [] } }), /audit failure/);
  assert.equal(failed.users.size, before);
  assert.equal([...failed.users.values()].some((user) => user.login === "New.User"), false);
  assert.equal([...failed.permissions.keys()].some((id) => !failed.users.has(id)), false);

  const rejected = fixture();
  await assert.rejects(rejected.service.create(actor(), { login: actorId, role: "ADMIN", permissions: [] }), (error: unknown) => error instanceof AdminUsersError && error.code === "DUPLICATE_LOGIN");
  await assert.rejects(rejected.service.create(actor(), { login: "valid-user", role: "USER", permissions: ["unknown"], vehicleAccess: { mode: "ALL", groupIds: [], vehicleIds: [] } }), (error: unknown) => error instanceof AdminUsersError && error.code === "INVALID_INPUT");
  assert.equal(rejected.auditEvents.length, 0);
});

test("access change records factual canonical before/after access and no-op writes zero event", async () => {
  const state = fixture([row(actorId, AuthRole.ADMIN), row(targetId, AuthRole.USER), row(otherId, AuthRole.ADMIN)]);
  await state.service.updateAccess(actor(), targetId, { role: "USER", permissions: ["historyAdmin.populate"], vehicleAccess: { mode: "ALL", groupIds: [], vehicleIds: [] } });
  assert.deepEqual(state.permissions.get(targetId), ["historyAdmin.view", "historyAdmin.populate"]);
  assert.deepEqual((state.auditEvents[0] as { details: unknown }).details, {
    targetLoginSnapshot: targetId,
    previousRole: "USER",
    role: "USER",
    previousPermissions: ["reports.view"],
    permissions: ["historyAdmin.view", "historyAdmin.populate"],
  });
  const count = state.auditEvents.length;
  await state.service.updateAccess(actor(), targetId, { role: "USER", permissions: ["historyAdmin.view", "historyAdmin.populate"], vehicleAccess: { mode: "ALL", groupIds: [], vehicleIds: [] } });
  assert.equal(state.auditEvents.length, count);
});

test("access audit failure rolls role and permission replacement back", async () => {
  const state = fixture([row(actorId, AuthRole.ADMIN), row(targetId, AuthRole.USER), row(otherId, AuthRole.ADMIN)], undefined, { append: async () => { throw new Error("audit failure"); } });
  await assert.rejects(state.service.updateAccess(actor(), targetId, { role: "ADMIN", permissions: [] }), /audit failure/);
  assert.equal(state.users.get(targetId)?.role, AuthRole.USER);
  assert.deepEqual(state.permissions.get(targetId), ["reports.view"]);
});

test("self and last-enabled ADMIN invariants remain zero-audit", async () => {
  const self = fixture();
  await assert.rejects(self.service.updateAccess(actor(), actorId, { role: "USER", permissions: [], vehicleAccess: { mode: "ALL", groupIds: [], vehicleIds: [] } }), AdminUsersError);
  await assert.rejects(self.service.disable(actor(), actorId), AdminUsersError);
  await assert.rejects(self.service.resetPassword(actor(), actorId), AdminUsersError);
  assert.equal(self.auditEvents.length, 0);

  const last = fixture([row(actorId, AuthRole.ADMIN), row(otherId, AuthRole.ADMIN, true)]);
  await assert.rejects(last.service.updateAccess(actor(otherId), actorId, { role: "USER", permissions: [], vehicleAccess: { mode: "ALL", groupIds: [], vehicleIds: [] } }), AdminUsersError);
  await assert.rejects(last.service.disable(actor(otherId), actorId), AdminUsersError);
  assert.equal(last.auditEvents.length, 0);
});

test("disable remains atomic and enable writes exactly once only for disabled-to-enabled", async () => {
  const state = fixture();
  await state.service.disable(actor(), targetId);
  assert.equal(state.users.get(targetId)?.disabled, true);
  assert.deepEqual(state.sessions.get(targetId), []);
  assert.equal((state.auditEvents[0] as { eventType: string }).eventType, "USER_DISABLED");
  await state.service.enable(actor(), targetId);
  assert.equal(state.users.get(targetId)?.disabled, false);
  assert.deepEqual(state.auditEvents[1], {
    eventType: "USER_ENABLED",
    actor: actor(),
    targetType: "USER",
    targetId,
    details: { targetLoginSnapshot: targetId },
  });
  await state.service.enable(actor(), targetId);
  assert.equal(state.auditEvents.length, 2);
});

test("disable and enable audit failures roll their state changes back", async () => {
  const disable = fixture(undefined, undefined, { append: async () => { throw new Error("audit failure"); } });
  await assert.rejects(disable.service.disable(actor(), targetId), /audit failure/);
  assert.equal(disable.users.get(targetId)?.disabled, false);
  assert.deepEqual(disable.sessions.get(targetId), [`${targetId}-session`]);

  const enable = fixture([row(actorId, AuthRole.ADMIN), row(targetId, AuthRole.USER, true)], undefined, { append: async () => { throw new Error("audit failure"); } });
  await assert.rejects(enable.service.enable(actor(), targetId), /audit failure/);
  assert.equal(enable.users.get(targetId)?.disabled, true);
});

test("password reset writes safe audit and preserves one-time credential secrecy", async () => {
  const oldPassword = "old secure password value";
  const old = await hashPassword(oldPassword);
  const target = { ...row(targetId, AuthRole.USER), passwordHashVersion: old.version, passwordSalt: new Uint8Array(old.salt), passwordHash: new Uint8Array(old.hash) };
  const state = fixture([row(actorId, AuthRole.ADMIN), target], DEFAULT_ADMIN_USER_SECURITY);
  const result = await state.service.resetPassword(actor(), targetId);
  const updated = state.users.get(targetId)!;
  const material = { version: updated.passwordHashVersion, salt: updated.passwordSalt, hash: updated.passwordHash };
  assert.equal(await verifyPassword(oldPassword, material), false);
  assert.equal(await verifyPassword(result.temporaryPassword, material), true);
  assert.equal(updated.mustChangePassword, true);
  assert.deepEqual(state.sessions.get(targetId), []);
  assert.deepEqual(state.auditEvents[0], { eventType: "USER_PASSWORD_RESET", actor: actor(), targetType: "USER", targetId, details: { targetLoginSnapshot: targetId } });
  assert.equal(JSON.stringify(state.auditEvents[0]).includes(result.temporaryPassword), false);
  for (const forbidden of ["passwordHash", "passwordSalt", "sessionId", "sessionToken", "mustChangePassword"]) assert.equal(JSON.stringify(state.auditEvents[0]).includes(forbidden), false);
});

test("reset audit failure rolls credential, must-change flag, and sessions back", async () => {
  const before = row(targetId, AuthRole.USER);
  const state = fixture([row(actorId, AuthRole.ADMIN), before], undefined, { append: async () => { throw new Error("audit failure"); } });
  await assert.rejects(state.service.resetPassword(actor(), targetId), /audit failure/);
  assert.deepEqual(state.users.get(targetId)?.passwordHash, before.passwordHash);
  assert.equal(state.users.get(targetId)?.mustChangePassword, false);
  assert.deepEqual(state.sessions.get(targetId), [`${targetId}-session`]);
});

test("one advisory lock serializes concurrent enabled-ADMIN reductions so zero is impossible", async () => {
  const state = fixture([row(adminAId, AuthRole.ADMIN), row(adminBId, AuthRole.ADMIN)]);
  const outcomes = await Promise.allSettled([state.service.disable(actor(managerId), adminAId), state.service.disable(actor(managerId), adminBId)]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === "rejected" && outcome.reason instanceof AdminUsersError && outcome.reason.code === "LAST_ENABLED_ADMIN").length, 1);
  assert.equal([...state.users.values()].filter((user) => user.role === AuthRole.ADMIN && !user.disabled).length, 1);
  assert.equal(state.locks(), 2);
});

test("advisory lock key and ordering remain fixed", () => {
  assert.equal(ADMIN_CARDINALITY_ADVISORY_LOCK_KEY, 1_706_170_002);
  const source = readFileSync(resolve(__dirname, "../../../src/modules/auth/admin-users.service.ts"), "utf8");
  assert.match(source, /\$executeRaw`SELECT pg_advisory_xact_lock/);
  assert.doesNotMatch(source, /\$queryRaw`SELECT pg_advisory_xact_lock/);
  assert.ok(source.indexOf("lockAdminCardinality(transaction)") < source.indexOf("enabledAdmins = await transaction.authUser.count"));
});

test("admin user projection exposes only a safe Telegram connection state", async () => {
  const connected = { ...row(targetId, AuthRole.USER), permissions: [], vehicleGroupGrants: [], vehicleGrants: [], telegramConnection: { status: "CONNECTED" as const, telegramUserId: 4_000_000_001n, telegramChatId: 4_000_000_002n } };
  const service = new AdminUsersService({ getClient: () => ({ authUser: { findMany: async () => [connected], findUnique: async () => connected } }) } as unknown as DatabaseService, DEFAULT_ADMIN_USER_SECURITY, { append: async () => ({}) } as never);
  const [listed] = await service.list(); const detail = await service.detail(targetId);
  for (const value of [listed!, detail]) {
    assert.equal(value.telegramStatus, "CONNECTED");
    const serialized = JSON.stringify(value);
    for (const forbidden of ["telegramUserId", "telegramChatId", "4000000001", "4000000002"]) assert.equal(serialized.includes(forbidden), false);
  }
});
