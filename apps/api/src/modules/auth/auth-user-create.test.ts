import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../generated/prisma/client";
import { AuthRole } from "../../generated/prisma/enums";
import { AuthUserCreateError, createAuthUser } from "./auth-user-create";

test("USER creation persists dependency-expanded recognized permissions atomically without plaintext", async () => {
  let transactionCount = 0; let userData: Record<string, unknown> | null = null; let permissionData: readonly Record<string, unknown>[] = [];
  const transaction = { authUser: { create: async ({ data }: { data: Record<string, unknown> }) => { userData = data; return { id: "user-id" }; } }, authUserPermission: { createMany: async ({ data }: { data: readonly Record<string, unknown>[] }) => { permissionData = data; } } };
  const client = { $transaction: async (callback: (value: typeof transaction) => Promise<void>) => { transactionCount += 1; await callback(transaction); } } as unknown as PrismaClient;
  const password = "violet otters navigate lunar harbors";
  const created = await createAuthUser(client, { login: "Dispatcher.1", role: AuthRole.USER, permissions: ["trips.view"], password });
  assert.equal(transactionCount, 1); assert.ok(userData); const persisted = userData as Record<string, unknown>; assert.equal(persisted.normalizedLogin, "dispatcher.1"); assert.equal(persisted.passwordHashVersion, 1); assert.equal("password" in persisted, false); assert.equal(JSON.stringify(persisted).includes(password), false); assert.deepEqual(permissionData.map((row) => row.key), ["vehicles.view", "trips.view"]); assert.deepEqual(created.permissions, ["vehicles.view", "trips.view"]);
});
test("ADMIN needs no permission rows and invalid/unknown input fails before a transaction", async () => { let transactions = 0; const client = { $transaction: async () => { transactions += 1; } } as unknown as PrismaClient; await assert.rejects(createAuthUser(client, { login: "bad login", role: AuthRole.ADMIN, permissions: [], password: "violet otters navigate lunar harbors" }), AuthUserCreateError); await assert.rejects(createAuthUser(client, { login: "valid-user", role: AuthRole.USER, permissions: ["unknown"], password: "violet otters navigate lunar harbors" }), AuthUserCreateError); assert.equal(transactions, 0); });
test("CLI creation rejects short and common supplied passwords before hashing or persistence", async () => { let transactions = 0; const client = { $transaction: async () => { transactions += 1; } } as unknown as PrismaClient; for (const password of ["elevenchars", "password1234", "valid-user2026"]) await assert.rejects(createAuthUser(client, { login: "valid-user", role: AuthRole.ADMIN, permissions: [], password }), AuthUserCreateError); assert.equal(transactions, 0); });
test("duplicate normalized login becomes a safe operator error", async () => { const client = { $transaction: async () => { throw Object.assign(new Error("database details"), { code: "P2002" }); } } as unknown as PrismaClient; await assert.rejects(createAuthUser(client, { login: "valid-user", role: AuthRole.ADMIN, permissions: [], password: "violet otters navigate lunar harbors" }), (error: unknown) => error instanceof AuthUserCreateError && !error.message.includes("database")); });
