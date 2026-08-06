import assert from "node:assert/strict";
import test from "node:test";
import { Test } from "@nestjs/testing";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import type { PrismaClient } from "../../generated/prisma/client";
import { AppModule } from "../../app.module";
import { DATABASE_CLIENT_FACTORY } from "../database/database.tokens";
import { AlertSettingsController } from "./alert-settings.controller";
import { AlertSettingsModule } from "./alert-settings.module";
import { AlertSettingsRepository } from "./alert-settings.repository";
import { AlertSettingsService } from "./alert-settings.service";

const config: ApiConfig = Object.freeze({ host: "127.0.0.1", port: 3000, database: Object.freeze({ url: "postgresql://user:password@example.test/db", poolMax: 1, connectionTimeoutMs: 100, idleTimeoutMs: 1_000 }), syncScheduler: Object.freeze({ enabled: false, fleetIntervalSeconds: 60, runsIntervalSeconds: 300, shutdownTimeoutMs: 50_000 }), equGps: Object.freeze({ officialBaseUrl: "https://trace.example.test", webBaseUrl: "https://web.example.test", email: "user@example.test", password: "password", requestTimeoutMs: 1_000, runsRequestTimeoutMs: 45_000 }) });

test("compiles lazily with a fake database and exports only the service", async () => {
  let queries = 0;
  const client = { $queryRaw: async () => { queries += 1; }, $disconnect: async () => {} } as unknown as PrismaClient;
  const module = await Test.createTestingModule({ imports: [AlertSettingsModule] }).overrideProvider(API_CONFIG).useValue(config).overrideProvider(DATABASE_CLIENT_FACTORY).useValue(() => client).compile();
  try {
    assert.equal(module.get(AlertSettingsService), module.get(AlertSettingsService));
    assert.ok(module.get(AlertSettingsController));
    assert.throws(() => module.get(AlertSettingsRepository, { strict: true }));
    assert.deepEqual(Reflect.getMetadata("exports", AlertSettingsModule), [AlertSettingsService]);
    assert.equal(queries, 0);
  } finally { await module.close(); }
});

test("AppModule integrates AlertSettingsModule exactly once", () => {
  const imports = Reflect.getMetadata("imports", AppModule) as readonly unknown[];
  assert.equal(imports.filter((value) => value === AlertSettingsModule).length, 1);
});
