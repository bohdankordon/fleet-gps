import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../generated/prisma/client";
import type { DatabaseConfig } from "../../config/api-config";
import { DatabaseService } from "./database.service";

const config: DatabaseConfig = { url: "postgresql://user:password@example.test/db", poolMax: 2, connectionTimeoutMs: 100, idleTimeoutMs: 1_000 };
test("DatabaseService creates one lazy client, pings once and disconnects idempotently", async () => {
  let created = 0, queries = 0, disconnects = 0;
  const client = { $queryRaw: async () => { queries += 1; }, $disconnect: async () => { disconnects += 1; } } as unknown as PrismaClient;
  const service = new DatabaseService(() => { created += 1; return client; }, config);
  assert.equal(created, 1); assert.equal(queries, 0); assert.equal(service.getClient(), service.getClient());
  await service.ping(); assert.equal(queries, 1);
  await service.disconnect(); await service.disconnect(); assert.equal(disconnects, 1);
});
test("DatabaseService does not expose client failures as serialized diagnostics", async () => {
  const failingClient = { $queryRaw: async () => { throw new Error("postgresql://user:password@example.test/db"); }, $disconnect: async () => { throw new Error("password"); } } as unknown as PrismaClient;
  const service = new DatabaseService(() => failingClient, config);
  await assert.rejects(() => service.ping()); await service.disconnect();
});
