import assert from "node:assert/strict";
import test from "node:test";
import { Test } from "@nestjs/testing";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import type { PrismaClient } from "../../generated/prisma/client";
import { AppModule } from "../../app.module";
import { DATABASE_CLIENT_FACTORY } from "../database/database.tokens";
import { CityGeofenceManagementService } from "./city-geofence-management.service";
import { CityGeofenceModule } from "./city-geofence.module";
import { CityGeofenceRepository } from "./city-geofence.repository";
import { CityGeofenceService } from "./city-geofence.service";

const config: ApiConfig = Object.freeze({ host: "127.0.0.1", port: 3000, database: Object.freeze({ url: "postgresql://unused:unused@example.test/db", poolMax: 1, connectionTimeoutMs: 100, idleTimeoutMs: 1_000 }), syncScheduler: Object.freeze({ enabled: false, fleetIntervalSeconds: 60, runsIntervalSeconds: 300, shutdownTimeoutMs: 50_000 }), alertIngestion: Object.freeze({ enabled: false }), telegramNotifications: Object.freeze({ enabled: false, botToken: null, chatId: null }), equGps: Object.freeze({ officialBaseUrl: "https://unused.invalid", webBaseUrl: "https://unused.invalid", email: "unused@example.test", password: "unused", requestTimeoutMs: 100, runsRequestTimeoutMs: 100 }) });

test("compiles lazily, exports application services only, and integrates once", async () => {
  let queries = 0;
  const client = { $queryRaw: async () => { queries += 1; }, $disconnect: async () => {} } as unknown as PrismaClient;
  const module = await Test.createTestingModule({ imports: [CityGeofenceModule] }).overrideProvider(API_CONFIG).useValue(config).overrideProvider(DATABASE_CLIENT_FACTORY).useValue(() => client).compile();
  try {
    assert.ok(module.get(CityGeofenceService));
    assert.ok(module.get(CityGeofenceManagementService));
    assert.throws(() => module.get(CityGeofenceRepository, { strict: true }));
    assert.deepEqual(Reflect.getMetadata("exports", CityGeofenceModule), [CityGeofenceManagementService, CityGeofenceService]);
    assert.equal(queries, 0);
  } finally { await module.close(); }
  const imports = Reflect.getMetadata("imports", AppModule) as readonly unknown[];
  assert.equal(imports.filter((value) => value === CityGeofenceModule).length, 1);
});
