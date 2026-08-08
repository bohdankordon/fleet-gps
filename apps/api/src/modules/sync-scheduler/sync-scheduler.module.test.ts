import assert from "node:assert/strict";
import test from "node:test";
import { Module, type DynamicModule, type InjectionToken, type Type } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import { AppModule } from "../../app.module";
import { DailyRunsSyncService } from "../dashboard/daily-runs-sync.service";
import { AlertObservationIngestionService } from "../alert-ingestion";
import { EQU_GPS_TRANSPORT } from "../equgps/equgps.tokens";
import { FleetSyncService } from "../fleet/fleet-sync.service";
import { DATABASE_CLIENT_FACTORY } from "../database/database.tokens";
import { SchedulerRegistryTimerAdapter } from "./scheduler-registry-timer.adapter";
import { SystemClock } from "./sync-scheduler-clock";
import { SyncSchedulerService } from "./sync-scheduler.service";
import { SyncSchedulerStatusService } from "./sync-scheduler-status.service";
import { SyncSchedulerModule } from "./sync-scheduler.module";
import { SCHEDULER_TIMER_ADAPTER, SYNC_SCHEDULER_CLOCK } from "./sync-scheduler.tokens";

const disabledConfig: ApiConfig = Object.freeze({
  host: "127.0.0.1",
  port: 3_000,
  database: Object.freeze({ url: "postgresql://unused:unused@127.0.0.1:1/unused", poolMax: 1, connectionTimeoutMs: 100, idleTimeoutMs: 1_000 }),
  syncScheduler: Object.freeze({ enabled: false, fleetIntervalSeconds: 60, runsIntervalSeconds: 300, shutdownTimeoutMs: 50_000 }),
  alertIngestion: Object.freeze({ enabled: false }),
  telegramNotifications: Object.freeze({ enabled: false, botToken: null, chatId: null }),
  equGps: Object.freeze({
    officialBaseUrl: "https://unused.invalid",
    webBaseUrl: "https://unused.invalid",
    email: "unused@example.invalid",
    password: "unused",
    requestTimeoutMs: 100,
    runsRequestTimeoutMs: 100,
  }),
});

type SafetyCounters = { fleetSyncCalls: number; runsSyncCalls: number; alertIngestionCalls: number; externalRequests: number; sqlCalls: number };

function createBuilder(imports: Array<Type<unknown> | DynamicModule>, counters: SafetyCounters): TestingModuleBuilder {
  const databaseClient = {
    $disconnect: async (): Promise<void> => undefined,
    $queryRaw: async (): Promise<never> => {
      counters.sqlCalls += 1;
      throw new Error("SQL must not be executed by this test");
    },
  };
  const transport = {
    request: async (): Promise<never> => {
      counters.externalRequests += 1;
      throw new Error("Network must not be used by this test");
    },
  };
  const fleetSync = { syncLatestSnapshot: async (): Promise<void> => { counters.fleetSyncCalls += 1; } };
  const runsSync = { syncCurrentDayRuns: async (): Promise<void> => { counters.runsSyncCalls += 1; } };
  const alertIngestion = { ingestObservation: async (): Promise<void> => { counters.alertIngestionCalls += 1; } };

  return Test.createTestingModule({ imports })
    .overrideProvider(API_CONFIG).useValue(disabledConfig)
    .overrideProvider(DATABASE_CLIENT_FACTORY).useValue(() => databaseClient)
    .overrideProvider(EQU_GPS_TRANSPORT).useValue(transport)
    .overrideProvider(FleetSyncService).useValue(fleetSync)
    .overrideProvider(DailyRunsSyncService).useValue(runsSync)
    .overrideProvider(AlertObservationIngestionService).useValue(alertIngestion);
}

function freshCounters(): SafetyCounters {
  return { fleetSyncCalls: 0, runsSyncCalls: 0, alertIngestionCalls: 0, externalRequests: 0, sqlCalls: 0 };
}

@Module({ imports: [SyncSchedulerModule] })
class StatusConsumerModule {}

function privateConsumer(token: InjectionToken): Type<unknown> {
  @Module({ imports: [SyncSchedulerModule], providers: [{ provide: "private-consumer", useFactory: (value: unknown) => value, inject: [token] }] })
  class PrivateConsumerModule {}
  return PrivateConsumerModule;
}

test("SyncSchedulerModule compiles as a real Nest module and preserves its internal singletons", async () => {
  const counters = freshCounters();
  const module = await createBuilder([SyncSchedulerModule], counters).compile();
  try {
    assert.equal(module.get(SyncSchedulerService), module.get(SyncSchedulerService));
    assert.equal(module.get(SyncSchedulerStatusService), module.get(SyncSchedulerStatusService));
    assert.equal(module.get(SYNC_SCHEDULER_CLOCK), module.get(SystemClock));
    assert.equal(module.get(SCHEDULER_TIMER_ADAPTER), module.get(SchedulerRegistryTimerAdapter));

    await module.init();
    assert.deepEqual(counters, { fleetSyncCalls: 0, runsSyncCalls: 0, alertIngestionCalls: 0, externalRequests: 0, sqlCalls: 0 });
    assert.equal(module.get(SchedulerRegistryTimerAdapter).hasInterval("taxi-gps:sync:fleet"), false);
    assert.equal(module.get(SchedulerRegistryTimerAdapter).hasInterval("taxi-gps:sync:runs"), false);
  } finally {
    await module.close();
  }
});

test("a consumer module receives the exported status service only", async () => {
  const counters = freshCounters();
  const module = await createBuilder([StatusConsumerModule], counters).compile();
  try {
    assert.ok(module.select(StatusConsumerModule).get(SyncSchedulerStatusService, { strict: false }));
  } finally {
    await module.close();
  }

  for (const token of [SyncSchedulerService, SYNC_SCHEDULER_CLOCK, SCHEDULER_TIMER_ADAPTER, FleetSyncService, DailyRunsSyncService]) {
    await assert.rejects(createBuilder([privateConsumer(token)], freshCounters()).compile());
  }
});

test("AppModule initializes with the scheduler disabled without sync, eQuGPS, or SQL activity", async () => {
  const counters = freshCounters();
  const module = await createBuilder([AppModule], counters).compile();
  try {
    await module.init();
    assert.deepEqual(counters, { fleetSyncCalls: 0, runsSyncCalls: 0, alertIngestionCalls: 0, externalRequests: 0, sqlCalls: 0 });

    const modules = [...(module as unknown as { container: { getModules(): Map<unknown, { metatype: unknown }> } }).container.getModules().values()];
    assert.equal(modules.filter((candidate) => candidate.metatype === ScheduleModule).length, 1);
  } finally {
    await module.close();
  }
});
