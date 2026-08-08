import assert from "node:assert/strict";
import test from "node:test";
import { Test } from "@nestjs/testing";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import type { PrismaClient } from "../../generated/prisma/client";
import { AppModule } from "../../app.module";
import { DATABASE_CLIENT_FACTORY } from "../database/database.tokens";
import { AlertEventProcessorService } from "./alert-event-processor.service";
import { AlertEventsLifecycleService } from "./alert-events-lifecycle.service";
import { AlertEventsModule } from "./alert-events.module";
import { PrismaAlertEventsRepository } from "./prisma-alert-events.repository";

const config: ApiConfig = Object.freeze({ host: "127.0.0.1", port: 3000, database: Object.freeze({ url: "postgresql://user:password@example.test/db", poolMax: 1, connectionTimeoutMs: 100, idleTimeoutMs: 1_000 }), syncScheduler: Object.freeze({ enabled: false, fleetIntervalSeconds: 60, runsIntervalSeconds: 300, shutdownTimeoutMs: 50_000 }), alertIngestion: Object.freeze({ enabled: false }), telegramNotifications: Object.freeze({ enabled: false, botToken: null, chatId: null, dispatchIntervalMs: 60_000, batchSize: 20 }), equGps: Object.freeze({ officialBaseUrl: "https://trace.example.test", webBaseUrl: "https://web.example.test", email: "user@example.test", password: "password", requestTimeoutMs: 1_000, runsRequestTimeoutMs: 45_000 }) });

test("module compiles lazily, exports lifecycle and processor services, and performs no DB work", async () => {
  let calls = 0;
  const client = { $queryRaw: async () => { calls += 1; }, $disconnect: async () => {} } as unknown as PrismaClient;
  const module = await Test.createTestingModule({ imports: [AlertEventsModule] }).overrideProvider(API_CONFIG).useValue(config).overrideProvider(DATABASE_CLIENT_FACTORY).useValue(() => client).compile();
  try {
    assert.ok(module.get(AlertEventsLifecycleService));
    assert.ok(module.get(AlertEventProcessorService));
    assert.throws(() => module.get(PrismaAlertEventsRepository, { strict: true }));
    assert.deepEqual(Reflect.getMetadata("exports", AlertEventsModule), [AlertEventsLifecycleService, AlertEventProcessorService]);
    assert.equal(Reflect.getMetadata("controllers", AlertEventsModule) ?? undefined, undefined);
    assert.equal(calls, 0);
  } finally { await module.close(); }
});

test("AppModule integrates AlertEventsModule exactly once", () => {
  const imports = Reflect.getMetadata("imports", AppModule) as readonly unknown[];
  assert.equal(imports.filter((value) => value === AlertEventsModule).length, 1);
});
