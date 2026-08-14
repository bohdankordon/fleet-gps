import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CHECK_IDS, SEVERITY, incidentFingerprint } from "../lib/monitor-config.mjs";
import { deliverHostNotification } from "../lib/host-notification.mjs";
import { MonitorConfigurationError } from "../lib/monitor-env.mjs";
import {
  buildBackupFailureMessage,
  buildIncidentMessage,
  buildMonitorSelfFailureMessage,
  buildRecoveryMessage,
  buildReminderMessage,
  buildTestMessage,
} from "../lib/monitor-message.mjs";
import { TelegramNotifyError, TelegramNotifier, deliverOperationalNotification, telegramNotifierInternals } from "../lib/monitor-notify.mjs";
import { NOTIFICATION_KIND, emptyState, planNotifications } from "../lib/monitor-state.mjs";

const WEB = incidentFingerprint(CHECK_IDS.CONTAINER_WEB, SEVERITY.CRITICAL);
const API = incidentFingerprint(CHECK_IDS.CONTAINER_API, SEVERITY.WARNING);
const T0 = 1_800_000_000_000;

function okResponse(payload = { ok: true }) {
  return { ok: true, status: 200, json: async () => payload };
}

const failureEnvironment = Object.freeze({
  OPS_ALERTS_ENABLED: "true",
  TELEGRAM_BOT_TOKEN: "SYNTHETIC_TOKEN",
  TELEGRAM_CHAT_ID: "SYNTHETIC_CHAT",
});

async function deliverThroughFakeTelegram(kind, overrides = {}) {
  const calls = [];
  const outcome = await deliverHostNotification({
    kind,
    env: { ...failureEnvironment, ...overrides },
    now: Date.UTC(2026, 7, 14, 12, 0, 0),
    send: async ({ botToken, chatId, message }) => {
      const notifier = new TelegramNotifier({
        botToken,
        chatId,
        fetchImplementation: async (url, init) => {
          calls.push({ url, init, message });
          return okResponse();
        },
      });
      await notifier.sendMessage(message);
    },
  });
  return { calls, outcome };
}

test("successful delivery posts chat_id and text and resolves only on ok true", async () => {
  const calls = [];
  const fetchImplementation = async (url, init) => {
    calls.push({ url, init });
    return okResponse();
  };
  const notifier = new TelegramNotifier({ botToken: "TOKEN_VALUE", chatId: "CHAT_VALUE", fetchImplementation });
  await notifier.sendMessage("hello");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.telegram.org/botTOKEN_VALUE/sendMessage");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.chat_id, "CHAT_VALUE");
  assert.equal(body.text, "hello");
});

test("HTTP failure returns a safe failure without token or raw response body", async () => {
  const fetchImplementation = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ ok: false, description: "RAW_BODY_SENTINEL" }),
  });
  const notifier = new TelegramNotifier({ botToken: "SECRET_TOKEN", chatId: "chat", fetchImplementation });
  await assert.rejects(() => notifier.sendMessage("hello"), (error) => {
    assert.ok(error instanceof TelegramNotifyError);
    assert.equal(error.message.includes("SECRET_TOKEN"), false);
    assert.equal(error.message.includes("RAW_BODY_SENTINEL"), false);
    assert.equal(error.code, "HTTP_5XX");
    return true;
  });
});

test("network failure is safe and does not leak the token", async () => {
  const fetchImplementation = async () => {
    throw new Error("network down");
  };
  const notifier = new TelegramNotifier({ botToken: "SECRET_TOKEN", chatId: "chat", fetchImplementation });
  await assert.rejects(() => notifier.sendMessage("hello"), (error) => {
    assert.ok(error instanceof TelegramNotifyError);
    assert.equal(error.code, "NETWORK");
    assert.equal(error.message.includes("SECRET_TOKEN"), false);
    return true;
  });
});

test("timeout produces a safe TIMEOUT failure", async () => {
  const fetchImplementation = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
  const notifier = new TelegramNotifier({ botToken: "SECRET_TOKEN", chatId: "chat", fetchImplementation, requestTimeoutMs: 5 });
  await assert.rejects(() => notifier.sendMessage("hello"), (error) => {
    assert.ok(error instanceof TelegramNotifyError);
    assert.equal(error.code, "TIMEOUT");
    return true;
  });
});

test("telegram ok false is classified as a rejection without leaking payload", async () => {
  const fetchImplementation = async () => ({ ok: true, status: 200, json: async () => ({ ok: false, description: "RAW_DESCRIPTION_SENTINEL" }) });
  const notifier = new TelegramNotifier({ botToken: "SECRET_TOKEN", chatId: "chat", fetchImplementation });
  await assert.rejects(() => notifier.sendMessage("hello"), (error) => {
    assert.equal(error.code, "TELEGRAM_REJECTED");
    assert.equal(error.message.includes("RAW_DESCRIPTION_SENTINEL"), false);
    return true;
  });
});

test("incident, reminder, recovery, test, backup-failure, and self-failure messages contain only safe facts", () => {
  const facts = { fingerprints: [WEB, API], siteHostname: "taxi.example.test", appImageTag: "v1.0.0", utcTimestamp: "2026-08-14T00:00:00.000Z" };
  const messages = [
    buildIncidentMessage(facts),
    buildReminderMessage(facts),
    buildRecoveryMessage(facts),
    buildTestMessage({ siteHostname: facts.siteHostname, appImageTag: facts.appImageTag, utcTimestamp: facts.utcTimestamp }),
    buildBackupFailureMessage({ tier: "daily", utcTimestamp: facts.utcTimestamp }),
    buildMonitorSelfFailureMessage({ utcTimestamp: facts.utcTimestamp }),
  ];
  for (const message of messages) {
    assert.equal(message.includes("SECRET_TOKEN"), false);
    assert.equal(message.includes("CHAT_VALUE"), false);
    assert.equal(message.includes("postgresql://"), false);
    assert.equal(message.includes("password"), false);
  }
  assert.match(buildIncidentMessage(facts), /CONTAINER_WEB/);
  assert.match(buildRecoveryMessage(facts), /CONTAINER_API/);
  assert.match(buildTestMessage({ siteHostname: "taxi.example.test", appImageTag: "v1.0.0", utcTimestamp: "2026-08-14T00:00:00.000Z" }), /TEST/);
});

test("deliverOperationalNotification performs zero transport for a NONE decision", async () => {
  const plan = planNotifications(emptyState(), [], { now: T0, alertsEnabled: true });
  assert.equal(plan.kind, NOTIFICATION_KIND.NONE);
  let calls = 0;
  const result = await deliverOperationalNotification({
    plan,
    buildText: () => "unused",
    send: async () => {
      calls += 1;
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.delivered, null);
});

test("deliverOperationalNotification advances state only on successful delivery", async () => {
  const incidentPlan = planNotifications(emptyState(), [WEB], { now: T0, alertsEnabled: true });
  const success = await deliverOperationalNotification({ plan: incidentPlan, buildText: () => "m", send: async () => {} });
  assert.equal(success.delivered, true);
  assert.deepEqual(success.nextState.open, [WEB]);

  const failure = await deliverOperationalNotification({
    plan: incidentPlan,
    buildText: () => "m",
    send: async () => {
      throw new Error("boom");
    },
  });
  assert.equal(failure.delivered, false);
  assert.deepEqual(failure.nextState.open, []);
});

test("monitor self-failure delivers despite malformed SITE_ADDRESS", async () => {
  const { calls, outcome } = await deliverThroughFakeTelegram("monitor", { SITE_ADDRESS: "http://invalid" });
  assert.equal(outcome.delivered, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].message, /MONITOR-SELF-FAILURE/);
  assert.equal(calls[0].message.includes(failureEnvironment.TELEGRAM_BOT_TOKEN), false);
  assert.equal(calls[0].init.body.includes(failureEnvironment.TELEGRAM_BOT_TOKEN), false);
});

test("monitor self-failure delivers despite missing or malformed BACKUP_DIR", async () => {
  for (const backupDir of [undefined, "relative/backups"]) {
    const { calls, outcome } = await deliverThroughFakeTelegram("monitor", { BACKUP_DIR: backupDir });
    assert.equal(outcome.delivered, true);
    assert.equal(calls.length, 1);
  }
});

test("daily backup failure delivers despite unrelated invalid monitor configuration", async () => {
  const { calls, outcome } = await deliverThroughFakeTelegram("backup-daily", {
    SITE_ADDRESS: "not-a-url",
    APP_IMAGE_TAG: "latest",
    BACKUP_DIR: "relative",
  });
  assert.equal(outcome.delivered, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].message, /BACKUP-FAILURE/);
  assert.match(calls[0].message, /tier: daily/);
});

test("weekly backup failure delivers despite unrelated invalid monitor configuration", async () => {
  const { calls, outcome } = await deliverThroughFakeTelegram("backup-weekly", {
    SITE_ADDRESS: "not-a-url",
    APP_IMAGE_TAG: "bad tag",
    BACKUP_DIR: "",
  });
  assert.equal(outcome.delivered, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].message, /tier: weekly/);
});

test("manual TEST still rejects unsafe SITE_ADDRESS and APP_IMAGE_TAG before transport", async () => {
  let calls = 0;
  for (const overrides of [{ SITE_ADDRESS: "http://invalid", APP_IMAGE_TAG: "v1.0.0" }, { SITE_ADDRESS: "https://taxi.example.test", APP_IMAGE_TAG: "latest" }]) {
    await assert.rejects(
      () =>
        deliverHostNotification({
          kind: "test",
          env: { ...failureEnvironment, ...overrides },
          send: async () => {
            calls += 1;
          },
        }),
      MonitorConfigurationError,
    );
  }
  assert.equal(calls, 0);
});

test("enabled failure notifier safely rejects missing Telegram token or chat ID", async () => {
  let calls = 0;
  for (const overrides of [{ TELEGRAM_BOT_TOKEN: "" }, { TELEGRAM_CHAT_ID: "" }]) {
    await assert.rejects(
      () =>
        deliverHostNotification({
          kind: "monitor",
          env: { ...failureEnvironment, ...overrides },
          send: async () => {
            calls += 1;
          },
        }),
      MonitorConfigurationError,
    );
  }
  assert.equal(calls, 0);
});

test("disabled ops alerts make zero failure-notifier transport calls", async () => {
  let calls = 0;
  const outcome = await deliverHostNotification({
    kind: "monitor",
    env: { OPS_ALERTS_ENABLED: "false", SITE_ADDRESS: "malformed", BACKUP_DIR: "relative" },
    send: async () => {
      calls += 1;
    },
  });
  assert.equal(outcome.disabled, true);
  assert.equal(calls, 0);
});

test("notify-host with alerts disabled exits zero without attempting delivery", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "taxi-gps-notify-"));
  try {
    const envFile = path.join(dir, ".env.production");
    writeFileSync(
      envFile,
      [
        "OPS_ALERTS_ENABLED=false",
        "TELEGRAM_BOT_TOKEN=",
        "TELEGRAM_CHAT_ID=",
        "SITE_ADDRESS=https://taxi.example.test",
        "APP_IMAGE_TAG=v1.0.0",
        "BACKUP_DIR=/srv/taxi-gps/backups",
      ].join("\n"),
      "utf8",
    );
    const result = spawnSync(process.execPath, [path.join(process.cwd(), "ops", "notify-host.mjs"), "--env-file", envFile, "--kind", "monitor"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /disabled/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("notify-host Telegram validation failure never leaks the token", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "taxi-gps-notify-"));
  try {
    const sentinel = "SENTINEL_BOT_TOKEN_98765";
    const envFile = path.join(dir, ".env.production");
    writeFileSync(
      envFile,
      [
        "OPS_ALERTS_ENABLED=true",
        "TELEGRAM_BOT_TOKEN=" + sentinel,
        "TELEGRAM_CHAT_ID=",
        "SITE_ADDRESS=http://invalid",
        "APP_IMAGE_TAG=latest",
        "BACKUP_DIR=relative",
      ].join("\n"),
      "utf8",
    );
    const result = spawnSync(process.execPath, [path.join(process.cwd(), "ops", "notify-host.mjs"), "--env-file", envFile, "--kind", "monitor"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout.includes(sentinel), false);
    assert.equal(result.stderr.includes(sentinel), false);
    assert.equal(result.stderr.includes("TELEGRAM_CHAT_ID"), true);
    assert.equal(result.stderr.includes("SITE_ADDRESS"), false);
    assert.equal(process.argv.join(" ").includes(sentinel), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the endpoint builder keeps the token in memory and never in argv", () => {
  const endpoint = telegramNotifierInternals.telegramEndpoint("https://api.telegram.org", "TOKEN_VALUE");
  assert.equal(endpoint, "https://api.telegram.org/botTOKEN_VALUE/sendMessage");
  assert.equal(process.argv.join(" ").includes("TOKEN_VALUE"), false);
});
