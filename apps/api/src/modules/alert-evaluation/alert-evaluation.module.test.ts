import assert from "node:assert/strict";
import test from "node:test";
import { Test } from "@nestjs/testing";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import type { PrismaClient } from "../../generated/prisma/client";
import { AppModule } from "../../app.module";
import { AlertEventsModule } from "../alert-events";
import { DATABASE_CLIENT_FACTORY } from "../database/database.tokens";
import { InactivityDetectorModule, InactivityDetectorService } from "../inactivity-detector";
import { SpeedingDetectorModule, SpeedingDetectorService } from "../speeding-detector";
import { AlertEvaluationModule } from "./alert-evaluation.module";
import { AlertEvaluationService } from "./alert-evaluation.service";

const config: ApiConfig = Object.freeze({ host: "127.0.0.1", port: 3000, database: Object.freeze({ url: "postgresql://user:password@example.test/db", poolMax: 1, connectionTimeoutMs: 100, idleTimeoutMs: 1_000 }), syncScheduler: Object.freeze({ enabled: false, fleetIntervalSeconds: 60, runsIntervalSeconds: 300, shutdownTimeoutMs: 50_000 }), alertIngestion: Object.freeze({ enabled: false }), telegramNotifications: Object.freeze({ enabled: false, botToken: null, chatId: null, dispatchIntervalMs: 60_000, batchSize: 20 }), equGps: Object.freeze({ officialBaseUrl: "https://trace.example.test", webBaseUrl: "https://web.example.test", email: "user@example.test", password: "password", requestTimeoutMs: 1_000, runsRequestTimeoutMs: 45_000 }) });

test("module imports production modules, declares only orchestration, and exports it", () => {
  assert.deepEqual(Reflect.getMetadata("imports", AlertEvaluationModule), [SpeedingDetectorModule, InactivityDetectorModule, AlertEventsModule]);
  assert.deepEqual(Reflect.getMetadata("providers", AlertEvaluationModule), [AlertEvaluationService]);
  assert.deepEqual(Reflect.getMetadata("exports", AlertEvaluationModule), [AlertEvaluationService]);
  assert.equal(Reflect.getMetadata("controllers", AlertEvaluationModule) ?? undefined, undefined);
});

test("one Nest context injects the exact exported singleton detector instances", async () => {
  const client = { $disconnect: async () => {} } as unknown as PrismaClient;
  const module = await Test.createTestingModule({ imports: [SpeedingDetectorModule, InactivityDetectorModule, AlertEventsModule, AlertEvaluationModule] })
    .overrideProvider(API_CONFIG).useValue(config)
    .overrideProvider(DATABASE_CLIENT_FACTORY).useValue(() => client)
    .compile();
  try {
    const evaluation = module.get(AlertEvaluationService);
    const injected = evaluation as unknown as { speedingDetector: SpeedingDetectorService; inactivityDetector: InactivityDetectorService };
    assert.equal(injected.speedingDetector, module.get(SpeedingDetectorService));
    assert.equal(injected.inactivityDetector, module.get(InactivityDetectorService));
  } finally { await module.close(); }
});

test("AppModule integrates AlertEvaluationModule exactly once without removing existing detector modules", () => {
  const imports = Reflect.getMetadata("imports", AppModule) as readonly unknown[];
  assert.equal(imports.filter((value) => value === AlertEvaluationModule).length, 1);
  assert.equal(imports.filter((value) => value === SpeedingDetectorModule).length, 1);
  assert.equal(imports.filter((value) => value === InactivityDetectorModule).length, 1);
  assert.equal(imports.filter((value) => value === AlertEventsModule).length, 1);
});
