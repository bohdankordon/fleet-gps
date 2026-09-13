import assert from "node:assert/strict";
import test from "node:test";
import { Test } from "@nestjs/testing";
import type { HttpRequest, HttpResponse, HttpTransport } from "@taxi-gps/equgps";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import { EQU_GPS_TRANSPORT } from "../equgps/equgps.tokens";
import { PositionHistoryHistoricalWindowModule } from "./position-history-historical-window.module";
import { PositionHistoryHistoricalWindowService } from "./position-history-historical-window.service";
import { POSITION_HISTORY_HISTORICAL_WINDOW_SLEEPER } from "./position-history-historical-window.tokens";

const config: ApiConfig = Object.freeze({ host: "127.0.0.1", port: 3000, database: Object.freeze({ url: "postgresql://user:password@example.test/db", poolMax: 1, connectionTimeoutMs: 100, idleTimeoutMs: 1_000 }), syncScheduler: Object.freeze({ enabled: false, fleetIntervalSeconds: 60, runsIntervalSeconds: 300, shutdownTimeoutMs: 50_000 }), alertIngestion: Object.freeze({ enabled: false }), positionHistoryMaintenance: Object.freeze({ enabled: false, windowBudget: 5_000 }), telegramNotifications: Object.freeze({ enabled: false, botToken: null, chatId: null, dispatchIntervalMs: 60_000, batchSize: 20 }), equGps: Object.freeze({ officialBaseUrl: "https://trace.example.test", webBaseUrl: "https://web.example.test", email: "user@example.test", password: "password", requestTimeoutMs: 1_000, runsRequestTimeoutMs: 45_000 }) });

test("historical-window module is lazy and owns no persistence, cursor, scheduler, or startup behavior", async () => {
  let http = 0;
  const transport: HttpTransport = { execute: async (_request: HttpRequest): Promise<HttpResponse> => { http += 1; throw new Error("unexpected"); } };
  const module = await Test.createTestingModule({ imports: [PositionHistoryHistoricalWindowModule] })
    .overrideProvider(API_CONFIG).useValue(config)
    .overrideProvider(EQU_GPS_TRANSPORT).useValue(transport)
    .compile();
  try {
    assert.ok(module.get(PositionHistoryHistoricalWindowService));
    assert.ok(module.get(POSITION_HISTORY_HISTORICAL_WINDOW_SLEEPER));
    assert.equal(http, 0);
    assert.deepEqual((Reflect.getMetadata("imports", PositionHistoryHistoricalWindowModule) as Array<{ name: string }>).map(({ name }) => name), ["EquGpsModule"]);
    const names = (Reflect.getMetadata("providers", PositionHistoryHistoricalWindowModule) as Array<{ name?: string }>).map(({ name }) => name).filter(Boolean);
    for (const forbidden of ["DatabaseService", "PrismaPositionHistoryBackfillRepository", "PrismaPositionHistoryIngestionCursorRepository", "PositionHistoryIngestionCursorService", "PositionHistoryBackfillService", "PositionHistoryPopulationRunPollerService"]) assert.equal(names.includes(forbidden), false);
  } finally { await module.close(); }
});
