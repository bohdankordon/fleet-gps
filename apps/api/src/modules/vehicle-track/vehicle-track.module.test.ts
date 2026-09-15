import assert from "node:assert/strict";
import test from "node:test";
import { Test } from "@nestjs/testing";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import type { PrismaClient } from "../../generated/prisma/client";
import { AppModule } from "../../app.module";
import { DatabaseModule } from "../database";
import { VehicleAccessModule } from "../vehicle-access/vehicle-access.module";
import { DATABASE_CLIENT_FACTORY } from "../database/database.tokens";
import { VehicleTrackOverviewController } from "./vehicle-track-overview.controller";
import { VehicleTrackController } from "./vehicle-track.controller";
import { VehicleTrackModule } from "./vehicle-track.module";

const config: ApiConfig = Object.freeze({ host: "127.0.0.1", port: 3000, database: Object.freeze({ url: "postgresql://user:password@example.test/db", poolMax: 1, connectionTimeoutMs: 100, idleTimeoutMs: 1_000 }), syncScheduler: Object.freeze({ enabled: false, fleetIntervalSeconds: 60, runsIntervalSeconds: 300, shutdownTimeoutMs: 50_000 }), alertIngestion: Object.freeze({ enabled: false }), positionHistoryMaintenance: Object.freeze({ enabled: false, windowBudget: 5_000 }), telegramNotifications: Object.freeze({ enabled: false, botToken: null, chatId: null, dispatchIntervalMs: 60_000, batchSize: 20 }), equGps: Object.freeze({ officialBaseUrl: "https://trace.example.test", webBaseUrl: "https://web.example.test", email: "user@example.test", password: "password", requestTimeoutMs: 1_000, runsRequestTimeoutMs: 45_000 }) });

test("VehicleTrackModule compiles lazily with database and vehicle access and performs no SQL or network work", async () => {
  let databaseCalls = 0;
  const client = { $queryRaw: async () => { databaseCalls += 1; }, $disconnect: async () => {} } as unknown as PrismaClient;
  const module = await Test.createTestingModule({ imports: [VehicleTrackModule] }).overrideProvider(API_CONFIG).useValue(config).overrideProvider(DATABASE_CLIENT_FACTORY).useValue(() => client).compile();
  try {
    assert.ok(module.get(VehicleTrackController));
    assert.ok(module.get(VehicleTrackOverviewController));
    assert.deepEqual(Reflect.getMetadata("imports", VehicleTrackModule), [DatabaseModule, VehicleAccessModule]);
    assert.equal(databaseCalls, 0);
  } finally { await module.close(); }
});

test("AppModule integrates VehicleTrackModule exactly once", () => {
  const imports = Reflect.getMetadata("imports", AppModule) as readonly unknown[];
  assert.equal(imports.filter((value) => value === VehicleTrackModule).length, 1);
});
