import assert from "node:assert/strict";
import test from "node:test";
import "./alert-notification-dispatcher.service.test";
import "./alert-notification-message.formatter.test";
import "./telegram-bot-notification.transport.test";
import "../alert-notification-scheduler/alert-notification-scheduler.service.test";
import "../alert-notification-scheduler/alert-notification-scheduler-timer.adapter.test";
import "../alert-notification-scheduler/alert-notification-scheduler.module.test";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../app.module";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import type { PrismaClient } from "../../generated/prisma/client";
import { DATABASE_CLIENT_FACTORY } from "../database/database.tokens";
import { AlertNotificationDispatcherService } from "./alert-notification-dispatcher.service";
import { AlertNotificationMessageFormatter } from "./alert-notification-message.formatter";
import { AlertNotificationOutboxRepository } from "./alert-notification-outbox.repository";
import { TELEGRAM_NOTIFICATION_TRANSPORT } from "./alert-notification.tokens";
import { AlertNotificationsModule } from "./alert-notifications.module";
import { TelegramBotNotificationTransport } from "./telegram-bot-notification.transport";

const config: ApiConfig = Object.freeze({ host: "127.0.0.1", port: 3000, database: Object.freeze({ url: "postgresql://user:password@example.test/db", poolMax: 1, connectionTimeoutMs: 100, idleTimeoutMs: 1_000 }), syncScheduler: Object.freeze({ enabled: false, fleetIntervalSeconds: 60, runsIntervalSeconds: 300, shutdownTimeoutMs: 50_000 }), alertIngestion: Object.freeze({ enabled: false }), positionHistoryMaintenance: Object.freeze({ enabled: false, windowBudget: 5_000 }), telegramNotifications: Object.freeze({ enabled: false, botToken: null, chatId: null, dispatchIntervalMs: 60_000, batchSize: 20 }), equGps: Object.freeze({ officialBaseUrl: "https://trace.example.test", webBaseUrl: "https://web.example.test", email: "user@example.test", password: "password", requestTimeoutMs: 1_000, runsRequestTimeoutMs: 45_000 }) });

test("outbox module boots with no database writes, network calls, controller, scheduler, or startup hook", async () => {
  let databaseCalls = 0;
  let externalRequests = 0;
  const originalFetch = globalThis.fetch;
  const client = { $queryRaw: async () => { databaseCalls += 1; }, $disconnect: async () => {} } as unknown as PrismaClient;
  if (typeof originalFetch === "function") globalThis.fetch = async () => { externalRequests += 1; throw new Error("Unexpected external request"); };
  const module = await Test.createTestingModule({ imports: [AlertNotificationsModule] })
    .overrideProvider(API_CONFIG).useValue(config)
    .overrideProvider(DATABASE_CLIENT_FACTORY).useValue(() => client)
    .compile();
  try {
    assert.ok(module.get(AlertNotificationOutboxRepository));
    assert.ok(module.get(AlertNotificationDispatcherService));
    assert.ok(module.get(AlertNotificationMessageFormatter));
    assert.ok(module.get(TelegramBotNotificationTransport));
    assert.equal(module.get(TELEGRAM_NOTIFICATION_TRANSPORT), module.get(TelegramBotNotificationTransport));
    const providers = Reflect.getMetadata("providers", AlertNotificationsModule) as readonly unknown[];
    assert.equal(providers.includes(AlertNotificationOutboxRepository), true);
    assert.equal(providers.includes(AlertNotificationMessageFormatter), true);
    assert.equal(providers.includes(AlertNotificationDispatcherService), true);
    assert.equal(providers.some((provider) => typeof provider === "object" && provider !== null && (provider as { provide?: unknown }).provide === TELEGRAM_NOTIFICATION_TRANSPORT), true);
    assert.deepEqual(Reflect.getMetadata("exports", AlertNotificationsModule), [AlertNotificationOutboxRepository, AlertNotificationDispatcherService]);
    assert.equal(Reflect.getMetadata("controllers", AlertNotificationsModule) ?? undefined, undefined);
    assert.equal("onModuleInit" in AlertNotificationOutboxRepository.prototype, false);
    assert.equal("onModuleInit" in AlertNotificationDispatcherService.prototype, false);
    assert.equal(databaseCalls, 0);
    assert.equal(externalRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await module.close();
  }
});

test("AppModule integrates AlertNotificationsModule exactly once", () => {
  const imports = Reflect.getMetadata("imports", AppModule) as readonly unknown[];
  assert.equal(imports.filter((value) => value === AlertNotificationsModule).length, 1);
});
