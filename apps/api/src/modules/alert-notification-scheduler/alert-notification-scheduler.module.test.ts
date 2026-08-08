import assert from "node:assert/strict";
import test from "node:test";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../app.module";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import type { PrismaClient } from "../../generated/prisma/client";
import { AlertNotificationDispatcherService } from "../alert-notifications/alert-notification-dispatcher.service";
import { AlertNotificationMessageFormatter } from "../alert-notifications/alert-notification-message.formatter";
import { AlertNotificationOutboxRepository } from "../alert-notifications/alert-notification-outbox.repository";
import { AlertNotificationsModule } from "../alert-notifications/alert-notifications.module";
import { TelegramBotNotificationTransport } from "../alert-notifications/telegram-bot-notification.transport";
import { DATABASE_CLIENT_FACTORY } from "../database/database.tokens";
import { SyncSchedulerModule } from "../sync-scheduler/sync-scheduler.module";
import { AlertNotificationSchedulerStatusService } from "./alert-notification-scheduler-status.service";
import { AlertNotificationSchedulerTimerAdapter } from "./alert-notification-scheduler-timer.adapter";
import { ALERT_NOTIFICATION_DISPATCH_INTERVAL_NAME, AlertNotificationSchedulerService } from "./alert-notification-scheduler.service";
import { AlertNotificationSchedulerModule } from "./alert-notification-scheduler.module";

const disabledConfig: ApiConfig = Object.freeze({
  host: "127.0.0.1",
  port: 3_000,
  database: Object.freeze({ url: "postgresql://unused:unused@127.0.0.1:1/unused", poolMax: 1, connectionTimeoutMs: 100, idleTimeoutMs: 1_000 }),
  syncScheduler: Object.freeze({ enabled: false, fleetIntervalSeconds: 60, runsIntervalSeconds: 300, shutdownTimeoutMs: 50_000 }),
  alertIngestion: Object.freeze({ enabled: false }),
  telegramNotifications: Object.freeze({ enabled: false, botToken: null, chatId: null, dispatchIntervalMs: 60_000, batchSize: 20 }),
  equGps: Object.freeze({ officialBaseUrl: "https://unused.invalid", webBaseUrl: "https://unused.invalid", email: "unused@example.invalid", password: "unused", requestTimeoutMs: 100, runsRequestTimeoutMs: 100 }),
});

function fakeClient(onSql: () => void): PrismaClient {
  return {
    $queryRaw: async () => { onSql(); throw new Error("SQL must not be executed"); },
    $disconnect: async () => undefined,
  } as unknown as PrismaClient;
}

test("notification scheduler module imports the outbox module and uses its exported dispatcher singleton", async () => {
  let sqlCalls = 0;
  const module = await Test.createTestingModule({ imports: [AlertNotificationSchedulerModule] })
    .overrideProvider(API_CONFIG).useValue(disabledConfig)
    .overrideProvider(DATABASE_CLIENT_FACTORY).useValue(() => fakeClient(() => { sqlCalls += 1; }))
    .compile();
  try {
    await module.init();
    const scheduler = module.get(AlertNotificationSchedulerService);
    const dispatcher = module.get(AlertNotificationDispatcherService);
    assert.equal((scheduler as unknown as { dispatcher: AlertNotificationDispatcherService }).dispatcher, dispatcher);
    assert.ok(module.get(AlertNotificationSchedulerStatusService));
    assert.equal(module.get(AlertNotificationSchedulerTimerAdapter).hasInterval(ALERT_NOTIFICATION_DISPATCH_INTERVAL_NAME), false);
    assert.equal(scheduler.getStatus().started, false);
    assert.equal(sqlCalls, 0);

    const imports = Reflect.getMetadata("imports", AlertNotificationSchedulerModule) as readonly unknown[];
    const providers = Reflect.getMetadata("providers", AlertNotificationSchedulerModule) as readonly unknown[];
    assert.equal(imports.filter((value) => value === AlertNotificationsModule).length, 1);
    for (const forbidden of [AlertNotificationDispatcherService, AlertNotificationOutboxRepository, AlertNotificationMessageFormatter, TelegramBotNotificationTransport]) {
      assert.equal(providers.includes(forbidden), false);
    }
    assert.equal(Reflect.getMetadata("controllers", AlertNotificationSchedulerModule) ?? undefined, undefined);
  } finally {
    await module.close();
  }
});

test("AppModule wires the notification scheduler exactly once and disabled startup performs no notification SQL or HTTP", async () => {
  let sqlCalls = 0;
  let externalRequests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { externalRequests += 1; throw new Error("HTTP must not be executed"); };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(API_CONFIG).useValue(disabledConfig)
    .overrideProvider(DATABASE_CLIENT_FACTORY).useValue(() => fakeClient(() => { sqlCalls += 1; }))
    .compile();
  try {
    await module.init();
    const imports = Reflect.getMetadata("imports", AppModule) as readonly unknown[];
    assert.equal(imports.filter((value) => value === AlertNotificationSchedulerModule).length, 1);
    assert.equal(module.get(AlertNotificationSchedulerService).getStatus().started, false);
    assert.equal(sqlCalls, 0);
    assert.equal(externalRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await module.close();
  }
});

test("existing SyncSchedulerModule remains independent and owns no notification scheduler provider", () => {
  const providers = Reflect.getMetadata("providers", SyncSchedulerModule) as readonly unknown[];
  const imports = Reflect.getMetadata("imports", SyncSchedulerModule) as readonly unknown[];
  assert.equal(providers.includes(AlertNotificationSchedulerService), false);
  assert.equal(imports.includes(AlertNotificationSchedulerModule), false);
});

