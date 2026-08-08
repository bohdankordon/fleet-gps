import assert from "node:assert/strict";
import test from "node:test";
import { Test } from "@nestjs/testing";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import type { PrismaClient } from "../../generated/prisma/client";
import { DATABASE_CLIENT_FACTORY } from "../database/database.tokens";
import { EQU_GPS_TRANSPORT } from "../equgps/equgps.tokens";
import type { HttpRequest, HttpResponse, HttpTransport } from "@taxi-gps/equgps";
import { FleetModule } from "./fleet.module";
import { FleetAlertIngestionService } from "./fleet-alert-ingestion.service";
import { FleetSyncService } from "./fleet-sync.service";
import { AlertIngestionModule, AlertObservationIngestionService } from "../alert-ingestion";
import { AlertEvaluationService } from "../alert-evaluation";
import { SpeedingDetectorService } from "../speeding-detector";
import { InactivityDetectorService } from "../inactivity-detector";

const config: ApiConfig = Object.freeze({ host: "127.0.0.1", port: 3000, database: Object.freeze({ url: "postgresql://user:password@example.test/db", poolMax: 1, connectionTimeoutMs: 100, idleTimeoutMs: 1_000 }), syncScheduler: Object.freeze({ enabled: false, fleetIntervalSeconds: 60, runsIntervalSeconds: 300, shutdownTimeoutMs: 50_000 }), alertIngestion: Object.freeze({ enabled: false }), telegramNotifications: Object.freeze({ enabled: false, botToken: null, chatId: null, dispatchIntervalMs: 60_000, batchSize: 20 }), equGps: Object.freeze({ officialBaseUrl: "https://trace.example.test", webBaseUrl: "https://web.example.test", email: "user@example.test", password: "password", requestTimeoutMs: 1_000, runsRequestTimeoutMs: 45_000 }) });
test("FleetModule compiles lazily, uses the exported ingestion singleton, and performs no SQL or HTTP", async () => {
  let sql = 0; let http = 0;
  const client = { $queryRaw: async () => { sql += 1; }, $disconnect: async () => {} } as unknown as PrismaClient;
  const transport: HttpTransport = { execute: async (_request: HttpRequest): Promise<HttpResponse> => { http += 1; throw new Error("unexpected"); } };
  const module = await Test.createTestingModule({ imports: [FleetModule] }).overrideProvider(API_CONFIG).useValue(config).overrideProvider(DATABASE_CLIENT_FACTORY).useValue(() => client).overrideProvider(EQU_GPS_TRANSPORT).useValue(transport).compile();
  try {
    const bridge = module.get(FleetAlertIngestionService);
    const ingestion = module.get(AlertObservationIngestionService);
    assert.equal(module.get(FleetSyncService), module.get(FleetSyncService));
    assert.equal((bridge as unknown as { ingestion: AlertObservationIngestionService }).ingestion, ingestion);
    assert.equal(sql, 0); assert.equal(http, 0);
    assert.deepEqual(Reflect.getMetadata("exports", FleetModule), [FleetSyncService]);
    assert.deepEqual(Reflect.getMetadata("imports", FleetModule), [expectModule("EquGpsModule"), expectModule("DatabaseModule"), AlertIngestionModule]);

    const providers = Reflect.getMetadata("providers", FleetModule) as readonly unknown[];
    for (const duplicate of [AlertObservationIngestionService, AlertEvaluationService, SpeedingDetectorService, InactivityDetectorService]) assert.equal(providers.includes(duplicate), false);

    const modules = [...(module as unknown as { container: { getModules(): Map<unknown, { providers: Map<unknown, unknown> }> } }).container.getModules().values()];
    for (const singleton of [AlertObservationIngestionService, AlertEvaluationService, SpeedingDetectorService, InactivityDetectorService]) {
      assert.equal(modules.filter((candidate) => candidate.providers.has(singleton)).length, 1);
    }
  }
  finally { await module.close(); }
});

function expectModule(name: string): unknown {
  return (Reflect.getMetadata("imports", FleetModule) as readonly { name?: string }[]).find((module) => module.name === name);
}
