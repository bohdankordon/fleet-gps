import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AuthRole } from "../../generated/prisma/enums";
import type { DatabaseService } from "../database/database.service";
import { AuthService, InvalidCredentialsError } from "./auth.service";
import { hashPassword } from "./password";

const now = new Date("2026-08-12T12:00:00.000Z");
const userId = "00000000-0000-4000-8000-000000000001";

async function fixture(auditFailure = false) {
  const material = await hashPassword("current secure password");
  const sessionCreates: Record<string, unknown>[] = [];
  const sessionDeletes: Record<string, unknown>[] = [];
  const auditEvents: unknown[] = [];
  let updated: Record<string, unknown> | null = null;
  let finalAuthorityRows: readonly Readonly<{ id: string }>[] = [{ id: userId }];
  let loginTransactions = 0;
  const user = { id: userId, login: "User.One", normalizedLogin: "user.one", role: AuthRole.USER, disabled: false, mustChangePassword: false, passwordHashVersion: material.version, passwordSalt: new Uint8Array(material.salt), passwordHash: new Uint8Array(material.hash), passwordChangedAt: null, createdAt: now, updatedAt: now, permissions: [{ key: "trips.view" }] };
  const transaction = {
    $queryRaw: async () => { loginTransactions += 1; return finalAuthorityRows; },
    authUser: {
      updateMany: async ({ data }: { data: Record<string, unknown> }) => { updated = data; return { count: 1 }; },
      findUniqueOrThrow: async () => ({ ...user, ...updated, permissions: user.permissions }),
    },
    authSession: {
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => { sessionDeletes.push(where); },
      create: async ({ data }: { data: Record<string, unknown> }) => { sessionCreates.push(data); },
    },
  };
  const client = {
    authUser: { findUnique: async ({ where }: { where: Record<string, unknown> }) => where.normalizedLogin === "user.one" || where.id === user.id ? user : null },
    authSession: {
      create: async ({ data }: { data: Record<string, unknown> }) => { sessionCreates.push(data); },
      findUnique: async () => null,
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => { sessionDeletes.push(where); },
    },
    $transaction: async (callback: (value: typeof transaction) => Promise<unknown>) => {
      const before = { updated, creates: sessionCreates.length, deletes: sessionDeletes.length };
      try { return await callback(transaction); }
      catch (error) { updated = before.updated; sessionCreates.length = before.creates; sessionDeletes.length = before.deletes; throw error; }
    },
  };
  const audit = {
    append: async (_client: unknown, event: unknown) => {
      if (auditFailure) throw new Error("audit failure");
      auditEvents.push(event);
      return { id: "audit" };
    },
  };
  return {
    service: new AuthService({ getClient: () => client } as unknown as DatabaseService, audit as never),
    user,
    sessionCreates,
    sessionDeletes,
    auditEvents,
    updated: () => updated,
    setFinalAuthority: (allowed: boolean) => { finalAuthorityRows = allowed ? [{ id: user.id }] : []; },
    loginTransactions: () => loginTransactions,
  };
}

test("valid login revalidates under transaction and creates one hashed seven-day server session", async () => {
  const state = await fixture();
  const result = await state.service.login("USER.ONE", "current secure password", now);
  assert.equal(result.user.login, "User.One");
  assert.deepEqual(result.user.permissions, ["vehicles.view", "trips.view"]);
  assert.equal(state.loginTransactions(), 1);
  assert.equal(state.sessionCreates.length, 1);
  assert.equal(state.sessionCreates[0]?.tokenHash instanceof Uint8Array, true);
  assert.equal(JSON.stringify(state.sessionCreates[0]).includes(result.token), false);
  assert.equal((state.sessionCreates[0]?.expiresAt as Date).getTime() - now.getTime(), 7 * 24 * 60 * 60 * 1_000);
  assert.equal(state.auditEvents.length, 0);
});

test("stale credential authority, disabled transition, unknown login, and wrong password create no session or audit", async () => {
  const state = await fixture();
  state.setFinalAuthority(false);
  await assert.rejects(state.service.login("user.one", "current secure password", now), InvalidCredentialsError);
  await assert.rejects(state.service.login("missing", "wrong password value", now), InvalidCredentialsError);
  await assert.rejects(state.service.login("user.one", "wrong password value", now), InvalidCredentialsError);
  assert.equal(state.sessionCreates.length, 0);
  assert.equal(state.auditEvents.length, 0);
});

test("own password change writes exact self-target event in the credential/session transaction", async () => {
  const state = await fixture();
  const principal = { id: state.user.id, login: state.user.login, role: state.user.role, permissions: [], mustChangePassword: true, sessionTokenHash: new Uint8Array(32) };
  await assert.rejects(state.service.changePassword(principal, "wrong password value", "next secure password", now), InvalidCredentialsError);
  assert.equal(state.auditEvents.length, 0);
  const result = await state.service.changePassword(principal, "current secure password", "next secure password", now);
  assert.equal(result.user.mustChangePassword, false);
  assert.deepEqual(state.sessionDeletes, [{ userId }]);
  assert.equal(state.sessionCreates.length, 1);
  assert.deepEqual(state.auditEvents, [{ eventType: "OWN_PASSWORD_CHANGED", actor: { actorType: "USER", actorUserId: userId, actorLoginSnapshot: "User.One" }, targetType: "USER", targetId: userId, details: {} }]);
  for (const forbidden of ["password", "passwordHash", "passwordSalt", "sessionToken", "sessionId"]) assert.equal(JSON.stringify(state.auditEvents[0]).includes(forbidden), false);
});

test("own-password audit failure rolls password and session mutation back", async () => {
  const state = await fixture(true);
  const principal = { id: state.user.id, login: state.user.login, role: state.user.role, permissions: [], mustChangePassword: false, sessionTokenHash: new Uint8Array(32) };
  await assert.rejects(state.service.changePassword(principal, "current secure password", "next secure password", now), /audit failure/);
  assert.equal(state.updated(), null);
  assert.equal(state.sessionDeletes.length, 0);
  assert.equal(state.sessionCreates.length, 0);
  assert.equal(state.auditEvents.length, 0);
});

test("session authentication is read-only and resolves current role/permissions", async () => {
  const baseUser = { id: userId, login: "user", normalizedLogin: "user", role: AuthRole.USER, disabled: false, mustChangePassword: false, passwordHashVersion: 1, passwordSalt: new Uint8Array(16), passwordHash: new Uint8Array(32), passwordChangedAt: null, createdAt: now, updatedAt: now };
  let authority: { role: AuthRole; permissions: { key: string }[]; disabled?: boolean } = { role: AuthRole.USER, permissions: [{ key: "reports.view" }] };
  let expiresAt = new Date(now.getTime() + 1);
  const client = { authSession: { findUnique: async () => ({ expiresAt, user: { ...baseUser, ...authority } }) } };
  const service = new AuthService({ getClient: () => client } as unknown as DatabaseService, { append: async () => ({ id: "unused" }) } as never);
  assert.deepEqual((await service.authenticate("a".repeat(43), now))?.permissions, ["reports.view"]);
  authority = { role: AuthRole.ADMIN, permissions: [] };
  assert.equal((await service.authenticate("a".repeat(43), now))?.role, AuthRole.ADMIN);
  expiresAt = now;
  assert.equal(await service.authenticate("b".repeat(43), now), null);
});

test("login final authority check still locks exact verified credential state before session creation", () => {
  const source = readFileSync("src/modules/auth/auth.service.ts", "utf8");
  const lock = source.indexOf("FOR UPDATE");
  const create = source.indexOf("transaction.authSession.create", lock);
  assert.ok(lock > 0 && create > lock);
  assert.match(source, /password_hash_version/);
  assert.match(source, /password_salt/);
  assert.match(source, /password_hash/);
  assert.match(source, /disabled[^\n]*= false/);
});
