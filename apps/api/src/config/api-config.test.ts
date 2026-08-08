import assert from "node:assert/strict";
import test from "node:test";
import { ApiConfigurationError, parseApiConfig } from "./api-config";

const valid = () => ({
  EQUGPS_BASE_URL: "https://trace.example.test/api",
  EQUGPS_WEB_BASE_URL: "https://web.example.test",
  EQUGPS_EMAIL: "user@example.test",
  EQUGPS_PASSWORD: " secret ",
  DATABASE_URL: "postgresql://user:password@example.test/db",
});

test("API config applies safe defaults, freezes config, and preserves the input object", () => {
  const env = valid();
  const before = { ...env };
  const config = parseApiConfig(env);

  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 3_000);
  assert.equal(config.equGps.requestTimeoutMs, 15_000);
  assert.equal(config.equGps.runsRequestTimeoutMs, 45_000);
  assert.deepEqual(config.database, {
    url: "postgresql://user:password@example.test/db",
    poolMax: 10,
    connectionTimeoutMs: 5_000,
    idleTimeoutMs: 30_000,
  });
  assert.deepEqual(config.syncScheduler, {
    enabled: false,
    fleetIntervalSeconds: 60,
    runsIntervalSeconds: 300,
    shutdownTimeoutMs: 50_000,
  });
  assert.deepEqual(config.alertIngestion, { enabled: false });
  assert.deepEqual(config.telegramNotifications, { enabled: false, botToken: null, chatId: null, dispatchIntervalMs: 60_000, batchSize: 20 });
  assert.deepEqual(env, before);
  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.syncScheduler), true);
  assert.equal(Object.isFrozen(config.alertIngestion), true);
  assert.equal(Object.isFrozen(config.telegramNotifications), true);
  assert.equal(Object.isFrozen(config.database), true);
  assert.equal(Object.isFrozen(config.equGps), true);
});

test("API config accepts valid scheduler values at both interval bounds", () => {
  const lower = parseApiConfig({
    ...valid(),
    SYNC_SCHEDULER_ENABLED: "true",
    FLEET_SYNC_INTERVAL_SECONDS: "15",
    RUNS_SYNC_INTERVAL_SECONDS: "60",
    SYNC_SCHEDULER_SHUTDOWN_TIMEOUT_MS: "1000",
  });
  const upper = parseApiConfig({
    ...valid(),
    SYNC_SCHEDULER_ENABLED: "false",
    FLEET_SYNC_INTERVAL_SECONDS: "3600",
    RUNS_SYNC_INTERVAL_SECONDS: "3600",
    SYNC_SCHEDULER_SHUTDOWN_TIMEOUT_MS: "120000",
  });

  assert.deepEqual(lower.syncScheduler, {
    enabled: true,
    fleetIntervalSeconds: 15,
    runsIntervalSeconds: 60,
    shutdownTimeoutMs: 1_000,
  });
  assert.deepEqual(upper.syncScheduler, {
    enabled: false,
    fleetIntervalSeconds: 3_600,
    runsIntervalSeconds: 3_600,
    shutdownTimeoutMs: 120_000,
  });
});

test("API config accepts custom eQuGPS timeouts", () => {
  const config = parseApiConfig({
    ...valid(),
    EQUGPS_REQUEST_TIMEOUT_MS: "16000",
    EQUGPS_RUNS_TIMEOUT_MS: "46000",
  });

  assert.equal(config.equGps.requestTimeoutMs, 16_000);
  assert.equal(config.equGps.runsRequestTimeoutMs, 46_000);
});

test("API config accepts an explicit alert-ingestion opt-in", () => {
  const config = parseApiConfig({ ...valid(), ALERT_INGESTION_ENABLED: "true" });
  assert.deepEqual(config.alertIngestion, { enabled: true });
});

test("Telegram notifications are opt-in and credentials are required only when enabled", () => {
  const enabled = parseApiConfig({
    ...valid(),
    TELEGRAM_NOTIFICATIONS_ENABLED: "true",
    TELEGRAM_BOT_TOKEN: " secret-token ",
    TELEGRAM_CHAT_ID: " private-chat ",
  });
  assert.deepEqual(enabled.telegramNotifications, { enabled: true, botToken: "secret-token", chatId: "private-chat", dispatchIntervalMs: 60_000, batchSize: 20 });

  for (const missing of ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] as const) {
    const env = { ...valid(), TELEGRAM_NOTIFICATIONS_ENABLED: "true", TELEGRAM_BOT_TOKEN: "token", TELEGRAM_CHAT_ID: "chat", [missing]: "" };
    assert.throws(() => parseApiConfig(env), (error: unknown) => {
      assert.ok(error instanceof ApiConfigurationError);
      assert.deepEqual(error.issues, [missing]);
      return true;
    });
  }
});

test("Telegram notification scheduler accepts interval bounds and dispatcher batch bounds", () => {
  const lower = parseApiConfig({ ...valid(), TELEGRAM_NOTIFICATION_DISPATCH_INTERVAL_MS: "1000", TELEGRAM_NOTIFICATION_BATCH_SIZE: "1" });
  const upper = parseApiConfig({ ...valid(), TELEGRAM_NOTIFICATION_DISPATCH_INTERVAL_MS: "3600000", TELEGRAM_NOTIFICATION_BATCH_SIZE: "100" });
  assert.equal(lower.telegramNotifications.dispatchIntervalMs, 1_000);
  assert.equal(lower.telegramNotifications.batchSize, 1);
  assert.equal(upper.telegramNotifications.dispatchIntervalMs, 3_600_000);
  assert.equal(upper.telegramNotifications.batchSize, 100);
});

test("Telegram notification scheduler rejects invalid interval and batch with safe field names", () => {
  const cases: readonly [string, string][] = [
    ["TELEGRAM_NOTIFICATION_DISPATCH_INTERVAL_MS", "999"],
    ["TELEGRAM_NOTIFICATION_DISPATCH_INTERVAL_MS", "3600001"],
    ["TELEGRAM_NOTIFICATION_DISPATCH_INTERVAL_MS", "1.5"],
    ["TELEGRAM_NOTIFICATION_BATCH_SIZE", "0"],
    ["TELEGRAM_NOTIFICATION_BATCH_SIZE", "101"],
    ["TELEGRAM_NOTIFICATION_BATCH_SIZE", "1.5"],
  ];
  for (const [field, value] of cases) {
    assert.throws(() => parseApiConfig({ ...valid(), [field]: value }), (error: unknown) => {
      assert.ok(error instanceof ApiConfigurationError);
      assert.deepEqual(error.issues, [field]);
      assert.equal(JSON.stringify(error).includes(value), false);
      return true;
    });
  }
});

test("Telegram configuration errors expose field names without credential values", () => {
  const token = "private-telegram-token";
  const chatId = "private-telegram-chat";
  try {
    parseApiConfig({ ...valid(), TELEGRAM_NOTIFICATIONS_ENABLED: "TRUE", TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId });
    assert.fail("expected configuration error");
  } catch (error) {
    assert.ok(error instanceof ApiConfigurationError);
    assert.deepEqual(error.issues, ["TELEGRAM_NOTIFICATIONS_ENABLED"]);
    const serialized = `${error.message} ${JSON.stringify(error)}`;
    assert.equal(serialized.includes(token), false);
    assert.equal(serialized.includes(chatId), false);
  }
});

test("API config rejects unsafe alert-ingestion boolean values", () => {
  for (const value of ["TRUE", "yes", "1", "   "]) {
    assert.throws(() => parseApiConfig({ ...valid(), ALERT_INGESTION_ENABLED: value }), (error: unknown) => {
      assert.ok(error instanceof ApiConfigurationError);
      assert.deepEqual(error.issues, ["ALERT_INGESTION_ENABLED"]);
      assert.equal(JSON.stringify(error).includes(value), false);
      return true;
    });
  }
});

test("API config rejects scheduler values with safe field names only", () => {
  const cases: readonly [string, string, string][] = [
    ["SYNC_SCHEDULER_ENABLED", "TRUE", "SYNC_SCHEDULER_ENABLED"],
    ["SYNC_SCHEDULER_ENABLED", "yes", "SYNC_SCHEDULER_ENABLED"],
    ["SYNC_SCHEDULER_ENABLED", "1", "SYNC_SCHEDULER_ENABLED"],
    ["SYNC_SCHEDULER_ENABLED", "   ", "SYNC_SCHEDULER_ENABLED"],
    ["FLEET_SYNC_INTERVAL_SECONDS", "14", "FLEET_SYNC_INTERVAL_SECONDS"],
    ["FLEET_SYNC_INTERVAL_SECONDS", "3601", "FLEET_SYNC_INTERVAL_SECONDS"],
    ["FLEET_SYNC_INTERVAL_SECONDS", "1.5", "FLEET_SYNC_INTERVAL_SECONDS"],
    ["FLEET_SYNC_INTERVAL_SECONDS", "invalid", "FLEET_SYNC_INTERVAL_SECONDS"],
    ["RUNS_SYNC_INTERVAL_SECONDS", "59", "RUNS_SYNC_INTERVAL_SECONDS"],
    ["RUNS_SYNC_INTERVAL_SECONDS", "3601", "RUNS_SYNC_INTERVAL_SECONDS"],
    ["RUNS_SYNC_INTERVAL_SECONDS", "1.5", "RUNS_SYNC_INTERVAL_SECONDS"],
    ["RUNS_SYNC_INTERVAL_SECONDS", "invalid", "RUNS_SYNC_INTERVAL_SECONDS"],
    ["SYNC_SCHEDULER_SHUTDOWN_TIMEOUT_MS", "999", "SYNC_SCHEDULER_SHUTDOWN_TIMEOUT_MS"],
    ["SYNC_SCHEDULER_SHUTDOWN_TIMEOUT_MS", "120001", "SYNC_SCHEDULER_SHUTDOWN_TIMEOUT_MS"],
    ["SYNC_SCHEDULER_SHUTDOWN_TIMEOUT_MS", "1.5", "SYNC_SCHEDULER_SHUTDOWN_TIMEOUT_MS"],
    ["SYNC_SCHEDULER_SHUTDOWN_TIMEOUT_MS", "invalid", "SYNC_SCHEDULER_SHUTDOWN_TIMEOUT_MS"],
  ];

  for (const [field, value, expected] of cases) {
    try {
      parseApiConfig({ ...valid(), [field]: value });
      assert.fail("expected configuration error");
    } catch (error) {
      assert.ok(error instanceof ApiConfigurationError);
      assert.deepEqual(error.issues, [expected]);
      assert.equal(JSON.stringify(error).includes(value), false);
    }
  }
});

test("API config accepts explicit valid values", () => {
  const env = {
    ...valid(),
    HOST: " localhost ",
    PORT: "3210",
    EQUGPS_REQUEST_TIMEOUT_MS: "16000",
    EQUGPS_RUNS_TIMEOUT_MS: "46000",
    DATABASE_POOL_MAX: "20",
    DATABASE_CONNECTION_TIMEOUT_MS: "6000",
    DATABASE_IDLE_TIMEOUT_MS: "40000",
  };
  const config = parseApiConfig(env);

  assert.equal(config.host, "localhost");
  assert.equal(env.HOST, " localhost ");
  assert.equal(config.port, 3_210);
  assert.equal(config.equGps.requestTimeoutMs, 16_000);
  assert.equal(config.equGps.runsRequestTimeoutMs, 46_000);
  assert.equal(config.database.poolMax, 20);
  assert.equal(config.database.connectionTimeoutMs, 6_000);
  assert.equal(config.database.idleTimeoutMs, 40_000);
});

test("API config rejects invalid port, missing credentials and unsafe official URL", () => {
  const invalidEnvironments = [
    { ...valid(), PORT: "0" },
    { ...valid(), HOST: "   " },
    { ...valid(), EQUGPS_EMAIL: "" },
    { ...valid(), EQUGPS_BASE_URL: "http://trace.example.test" },
    { ...valid(), DATABASE_URL: "" },
    { ...valid(), DATABASE_POOL_MAX: "0" },
    { ...valid(), DATABASE_CONNECTION_TIMEOUT_MS: "99" },
    { ...valid(), DATABASE_IDLE_TIMEOUT_MS: "999" },
  ];

  for (const env of invalidEnvironments) {
    assert.throws(() => parseApiConfig(env), ApiConfigurationError);
  }
});

test("API config exposes only safe eQuGPS field names", () => {
  const cases: readonly [Record<string, string>, readonly string[]][] = [
    [{ ...valid(), EQUGPS_EMAIL: "" }, ["EQUGPS_EMAIL"]],
    [{ ...valid(), EQUGPS_BASE_URL: "http://trace.example.test" }, ["EQUGPS_BASE_URL"]],
    [{ ...valid(), EQUGPS_REQUEST_TIMEOUT_MS: "invalid" }, ["EQUGPS_REQUEST_TIMEOUT_MS"]],
    [{ ...valid(), EQUGPS_RUNS_TIMEOUT_MS: "999" }, ["EQUGPS_RUNS_TIMEOUT_MS"]],
  ];

  for (const [env, expected] of cases) {
    assert.throws(() => parseApiConfig(env), (error: unknown) => {
      assert.ok(error instanceof ApiConfigurationError);
      assert.deepEqual(error.issues, expected);
      return true;
    });
  }
});

test("API configuration errors do not serialize secrets or environment values", () => {
  const email = "private@example.test";
  const password = "private password";
  const url = "https://trace.example.test/?token=private";

  try {
    parseApiConfig({ ...valid(), EQUGPS_EMAIL: email, EQUGPS_PASSWORD: password, EQUGPS_BASE_URL: url });
    assert.fail("expected configuration error");
  } catch (error) {
    assert.ok(error instanceof ApiConfigurationError);
    const text = `${error.message} ${JSON.stringify(error)}`;
    assert.equal(text.includes(email), false);
    assert.equal(text.includes(password), false);
    assert.equal(text.includes(url), false);
  }
});
