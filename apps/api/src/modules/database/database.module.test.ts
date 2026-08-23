import assert from "node:assert/strict";
import test from "node:test";
import { Test } from "@nestjs/testing";
import type { ApiConfig } from "../../config/api-config";
import type { PrismaClient } from "../../generated/prisma/client";
import { API_CONFIG } from "../../config/api-config.tokens";
import { DatabaseModule } from "./database.module";
import { DatabaseService } from "./database.service";
import { DATABASE_CLIENT_FACTORY } from "./database.tokens";

const config: ApiConfig = Object.freeze({ host: "127.0.0.1", port: 3000, database: Object.freeze({ url: "postgresql://user:password@example.test/db", poolMax: 1, connectionTimeoutMs: 100, idleTimeoutMs: 1_000 }), syncScheduler: Object.freeze({ enabled: false, fleetIntervalSeconds: 60, runsIntervalSeconds: 300, shutdownTimeoutMs: 50_000 }), alertIngestion: Object.freeze({ enabled: false }), positionHistoryMaintenance: Object.freeze({ enabled: false, windowBudget: 5_000 }), telegramNotifications: Object.freeze({ enabled: false, botToken: null, chatId: null, dispatchIntervalMs: 60_000, batchSize: 20 }), equGps: Object.freeze({ officialBaseUrl: "https://trace.example.test", webBaseUrl: "https://web.example.test", email: "user@example.test", password: "password", requestTimeoutMs: 1_000, runsRequestTimeoutMs: 45_000 }) });
test("DatabaseModule compiles without SQL and provides one singleton client", async () => {
  let factories = 0, queries = 0, disconnects = 0; const client = { $queryRaw: async () => { queries += 1; }, $disconnect: async () => { disconnects += 1; } } as unknown as PrismaClient;
  const module = await Test.createTestingModule({ imports: [DatabaseModule] }).overrideProvider(API_CONFIG).useValue(config).overrideProvider(DATABASE_CLIENT_FACTORY).useValue(() => { factories += 1; return client; }).compile();
  try { assert.equal(factories, 1); assert.equal(queries, 0); assert.equal(module.get(DatabaseService), module.get(DatabaseService)); }
  finally { await module.close(); assert.equal(disconnects, 1); }
});
