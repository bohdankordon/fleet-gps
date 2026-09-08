import assert from "node:assert/strict";
import test from "node:test";
import { AuthRole } from "../../generated/prisma/enums";
import type { DatabaseService } from "../database/database.service";
import { ADMIN_USER_INCLUDE, AdminUsersService } from "./admin-users.service";

const now = new Date("2026-08-12T12:00:00.000Z");
const actorId = "00000000-0000-4000-8000-000000000001";
const targetId = "00000000-0000-4000-8000-000000000002";
function actor() { return Object.freeze({ actorType: "USER" as const, actorUserId: actorId, actorLoginSnapshot: "admin" }); }
function baseRow(status: "CONNECTED" | "BROKEN" | "DISCONNECTED" | null) { return { id: targetId, login: "target", normalizedLogin: "target", role: AuthRole.USER, disabled: false, mustChangePassword: false, passwordHashVersion: 1, passwordSalt: new Uint8Array([1]), passwordHash: new Uint8Array([2]), passwordChangedAt: null, createdAt: now, updatedAt: now, permissions: [{ key: "reports.view" }], telegramConnection: status === null ? null : { status } }; }
function fixture(status: "CONNECTED" | "BROKEN" | "DISCONNECTED" | null) {
  const stored = baseRow(status);
  const seenIncludes: unknown[] = [];
  const tx: any = { $executeRaw: async () => 1, authUser: { findUnique: async (args: any) => { seenIncludes.push(args.include); return { ...stored, permissions: [...stored.permissions] }; }, findUniqueOrThrow: async (args: any) => { seenIncludes.push(args.include); return { ...stored, permissions: [...stored.permissions] }; }, update: async ({ data }: any) => Object.assign(stored, data), count: async () => 2 }, authUserPermission: { deleteMany: async () => {}, createMany: async () => {} }, authSession: { deleteMany: async () => {} } };
  const client: any = { authUser: tx.authUser, $transaction: async (cb: any) => cb(tx) };
  const database = { getClient: () => client } as unknown as DatabaseService;
  const security: any = { generatePassword: () => "A".repeat(24), hashPassword: async () => ({ version: 1, salt: new Uint8Array([1]), hash: new Uint8Array([2]) }) };
  const audit: any = { append: async () => ({}) };
  return { service: new AdminUsersService(database, security, audit), seenIncludes };
}

test("Phase0 user 11: connected Telegram status survives access mutation response", async () => {
  const f = fixture("CONNECTED");
  const updated = await f.service.updateAccess(actor(), targetId, { role: "USER", permissions: ["reports.view"] });
  assert.equal(updated.telegramStatus, "CONNECTED");
  assert.equal(f.seenIncludes.every((inc: any) => inc && (inc as any).telegramConnection), true);
});

test("Phase0 user 12: survives enable disable reset response where applicable", async () => {
  const e = fixture("CONNECTED");
  assert.equal((await e.service.enable(actor(), targetId)).telegramStatus, "CONNECTED");
  const d = fixture("CONNECTED");
  assert.equal((await d.service.disable(actor(), targetId)).telegramStatus, "CONNECTED");
  const r = fixture("CONNECTED");
  assert.equal((await r.service.resetPassword(actor(), targetId)).user.telegramStatus, "CONNECTED");
});

test("Phase0 user 13: non-connected status remains truthful", async () => {
  for (const status of [null, "DISCONNECTED", "BROKEN"] as const) {
    const expected = status === null ? "NOT_CONNECTED" : status;
    const f = fixture(status);
    assert.equal((await f.service.updateAccess(actor(), targetId, { role: "USER", permissions: ["reports.view"] })).telegramStatus, expected);
  }
});

test("Phase0 user 14: no secret relation fields exposed and authoritative include is status-only", async () => {
  const f = fixture("CONNECTED");
  const updated = await f.service.updateAccess(actor(), targetId, { role: "USER", permissions: ["reports.view"] });
  const json = JSON.stringify(updated);
  for (const forbidden of ["token", "secret", "chatId", "telegramUserId", "passwordHash", "passwordSalt"]) assert.equal(json.includes(forbidden), false, forbidden);
  assert.deepEqual(Object.keys(ADMIN_USER_INCLUDE as any).sort(), ["permissions", "telegramConnection"]);
  assert.deepEqual((ADMIN_USER_INCLUDE as any).telegramConnection, { select: { status: true } });
});
