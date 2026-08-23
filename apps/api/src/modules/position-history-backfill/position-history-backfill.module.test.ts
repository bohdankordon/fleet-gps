import assert from "node:assert/strict";
import test from "node:test";
import { Test } from "@nestjs/testing";
import type { HttpRequest, HttpResponse, HttpTransport } from "@taxi-gps/equgps";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import type { PrismaClient } from "../../generated/prisma/client";
import { DATABASE_CLIENT_FACTORY } from "../database/database.tokens";
import { EQU_GPS_TRANSPORT } from "../equgps/equgps.tokens";
import { PositionHistoryBackfillModule } from "./position-history-backfill.module";
import { PositionHistoryBackfillService } from "./position-history-backfill.service";
import { PositionHistoryFleetBackfillService } from "./position-history-fleet-backfill.service";

const config: ApiConfig = Object.freeze({ host: "127.0.0.1", port: 3000, database: Object.freeze({ url: "postgresql://user:password@example.test/db", poolMax: 1, connectionTimeoutMs: 100, idleTimeoutMs: 1_000 }), syncScheduler: Object.freeze({ enabled: false, fleetIntervalSeconds: 60, runsIntervalSeconds: 300, shutdownTimeoutMs: 50_000 }), alertIngestion: Object.freeze({ enabled: false }), positionHistoryMaintenance: Object.freeze({ enabled: false, windowBudget: 5_000 }), telegramNotifications: Object.freeze({ enabled: false, botToken: null, chatId: null, dispatchIntervalMs: 60_000, batchSize: 20 }), equGps: Object.freeze({ officialBaseUrl: "https://trace.example.test", webBaseUrl: "https://web.example.test", email: "user@example.test", password: "password", requestTimeoutMs: 1_000, runsRequestTimeoutMs: 45_000 }) });

test("backfill module is lazy and structurally excludes fleet, CurrentState, alerts, and notifications", async () => {
  let sql = 0;
  let http = 0;
  const client = { $queryRaw: async () => { sql += 1; }, $disconnect: async () => undefined } as unknown as PrismaClient;
  const transport: HttpTransport = { execute: async (_request: HttpRequest): Promise<HttpResponse> => { http += 1; throw new Error("unexpected"); } };
  const module = await Test.createTestingModule({ imports: [PositionHistoryBackfillModule] }).overrideProvider(API_CONFIG).useValue(config).overrideProvider(DATABASE_CLIENT_FACTORY).useValue(() => client).overrideProvider(EQU_GPS_TRANSPORT).useValue(transport).compile();
  try {
    assert.ok(module.get(PositionHistoryBackfillService));
    assert.ok(module.get(PositionHistoryFleetBackfillService));
    assert.equal(sql, 0);
    assert.equal(http, 0);
    assert.deepEqual((Reflect.getMetadata("imports", PositionHistoryBackfillModule) as Array<{ name: string }>).map((value) => value.name), ["DatabaseModule", "EquGpsModule"]);
    assert.deepEqual(Reflect.getMetadata("exports", PositionHistoryBackfillModule), [PositionHistoryBackfillService, PositionHistoryFleetBackfillService]);
    const providerNames = (Reflect.getMetadata("providers", PositionHistoryBackfillModule) as Array<{ name?: string }>).map((value) => value?.name).filter(Boolean);
    for (const forbidden of ["FleetSyncService", "FleetAlertIngestionService", "AlertObservationIngestionService", "AlertEvaluationService", "AlertNotificationDispatcherService"]) assert.equal(providerNames.includes(forbidden), false);
  } finally { await module.close(); }
});
