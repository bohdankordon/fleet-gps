import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseOpsAlertsEnabled } from "../lib/deployment-config.mjs";
import {
  DEFAULT_STATE_DIR,
  MonitorConfigurationError,
  loadEnvironment,
  parseArguments,
  validateMonitorEnvironment,
  validateNotifierEnvironment,
} from "../lib/monitor-env.mjs";

const valid = Object.freeze({
  OPS_ALERTS_ENABLED: "false",
  SITE_ADDRESS: "https://taxi.example.test",
  APP_IMAGE_TAG: "v1.0.0-e5a0f41",
  BACKUP_DIR: "/srv/taxi-gps/backups",
});

function issues(overrides, options) {
  try {
    return validateMonitorEnvironment({ ...valid, ...overrides }, options);
  } catch (error) {
    assert.ok(error instanceof MonitorConfigurationError);
    return error.issues;
  }
}

function failedIssues(overrides, options) {
  const result = issues(overrides, options);
  assert.ok(Array.isArray(result), "expected validation to fail");
  return result;
}

function withEnvironmentFile(lines, callback) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "taxi-gps-explicit-env-"));
  const envFile = path.join(directory, ".env.production");
  try {
    writeFileSync(envFile, lines.join("\n"), "utf8");
    return callback(envFile);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function withInheritedEnvironment(values, callback) {
  const previous = new Map(Object.keys(values).map((name) => [name, process.env[name]]));
  try {
    Object.assign(process.env, values);
    return callback();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("OPS_ALERTS_ENABLED=false is valid without operational Telegram credentials", () => {
  const config = issues({ OPS_ALERTS_ENABLED: "false" });
  assert.equal(config.alertsEnabled, false);
  assert.equal(config.botToken, null);
  assert.equal(config.chatId, null);
});

test("missing OPS_ALERTS_ENABLED defaults to false", () => {
  const config = issues({ OPS_ALERTS_ENABLED: undefined });
  assert.equal(config.alertsEnabled, false);
});

test("missing explicit OPS_ALERTS_ENABLED stays false despite inherited enabled credentials", () => {
  withInheritedEnvironment(
    {
      OPS_ALERTS_ENABLED: "true",
      TELEGRAM_BOT_TOKEN: "INHERITED_TOKEN_SENTINEL",
      TELEGRAM_CHAT_ID: "INHERITED_CHAT_SENTINEL",
    },
    () =>
      withEnvironmentFile(
        ["SITE_ADDRESS=https://taxi.example.test", "APP_IMAGE_TAG=v1.0.0", "BACKUP_DIR=/srv/taxi-gps/backups"],
        (envFile) => {
          const config = validateMonitorEnvironment(loadEnvironment(envFile));
          assert.equal(config.alertsEnabled, false);
          assert.equal(config.botToken, null);
          assert.equal(config.chatId, null);
        },
      ),
  );
});

test("inherited Telegram token cannot satisfy a missing explicit enabled token", () => {
  withInheritedEnvironment(
    { TELEGRAM_BOT_TOKEN: "INHERITED_TOKEN_SENTINEL" },
    () =>
      withEnvironmentFile(["OPS_ALERTS_ENABLED=true", "TELEGRAM_CHAT_ID=explicit-chat"], (envFile) => {
        assert.throws(
          () => validateNotifierEnvironment(loadEnvironment(envFile)),
          (error) => error instanceof MonitorConfigurationError && error.issues.includes("TELEGRAM_BOT_TOKEN") && !error.message.includes("INHERITED_TOKEN_SENTINEL"),
        );
      }),
  );
});

test("inherited Telegram chat ID cannot satisfy a missing explicit enabled chat ID", () => {
  withInheritedEnvironment(
    { TELEGRAM_CHAT_ID: "INHERITED_CHAT_SENTINEL" },
    () =>
      withEnvironmentFile(["OPS_ALERTS_ENABLED=true", "TELEGRAM_BOT_TOKEN=explicit-token"], (envFile) => {
        assert.throws(
          () => validateNotifierEnvironment(loadEnvironment(envFile)),
          (error) => error instanceof MonitorConfigurationError && error.issues.includes("TELEGRAM_CHAT_ID") && !error.message.includes("INHERITED_CHAT_SENTINEL"),
        );
      }),
  );
});

test("monitor configuration fields missing from the explicit file cannot inherit SITE_ADDRESS, APP_IMAGE_TAG, or BACKUP_DIR", () => {
  const cases = [
    { missing: "SITE_ADDRESS", inherited: { SITE_ADDRESS: "https://inherited.example.test" }, lines: ["OPS_ALERTS_ENABLED=false", "APP_IMAGE_TAG=v1.0.0", "BACKUP_DIR=/srv/taxi-gps/backups"] },
    { missing: "APP_IMAGE_TAG", inherited: { APP_IMAGE_TAG: "v9.9.9" }, lines: ["OPS_ALERTS_ENABLED=false", "SITE_ADDRESS=https://taxi.example.test", "BACKUP_DIR=/srv/taxi-gps/backups"] },
    { missing: "BACKUP_DIR", inherited: { BACKUP_DIR: "/inherited/backups" }, lines: ["OPS_ALERTS_ENABLED=false", "SITE_ADDRESS=https://taxi.example.test", "APP_IMAGE_TAG=v1.0.0"] },
  ];
  for (const fixture of cases) {
    withInheritedEnvironment(fixture.inherited, () =>
      withEnvironmentFile(fixture.lines, (envFile) => {
        assert.throws(
          () => validateMonitorEnvironment(loadEnvironment(envFile)),
          (error) => error instanceof MonitorConfigurationError && error.issues.includes(fixture.missing),
        );
      }),
    );
  }
});

test("explicit env values remain authoritative over conflicting inherited values", () => {
  withInheritedEnvironment(
    {
      OPS_ALERTS_ENABLED: "false",
      TELEGRAM_BOT_TOKEN: "INHERITED_TOKEN",
      TELEGRAM_CHAT_ID: "INHERITED_CHAT",
      SITE_ADDRESS: "https://inherited.example.test",
      APP_IMAGE_TAG: "v9.9.9",
      BACKUP_DIR: "/inherited/backups",
    },
    () =>
      withEnvironmentFile(
        [
          "OPS_ALERTS_ENABLED=true",
          "TELEGRAM_BOT_TOKEN=explicit-token",
          "TELEGRAM_CHAT_ID=explicit-chat",
          "SITE_ADDRESS=https://explicit.example.test",
          "APP_IMAGE_TAG=v1.0.0",
          "BACKUP_DIR=/explicit/backups",
        ],
        (envFile) => {
          const config = validateMonitorEnvironment(loadEnvironment(envFile));
          assert.equal(config.alertsEnabled, true);
          assert.equal(config.botToken, "explicit-token");
          assert.equal(config.chatId, "explicit-chat");
          assert.equal(config.siteAddress, "https://explicit.example.test");
          assert.equal(config.appImageTag, "v1.0.0");
          assert.equal(config.backupDir, "/explicit/backups");
        },
      ),
  );
});

test("OPS_ALERTS_ENABLED=true with valid token and chat ID passes", () => {
  const config = issues({ OPS_ALERTS_ENABLED: "true", TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_CHAT_ID: "456" });
  assert.equal(config.alertsEnabled, true);
  assert.equal(config.botToken, "123:abc");
  assert.equal(config.chatId, "456");
});

test("OPS_ALERTS_ENABLED=true with a missing token fails on TELEGRAM_BOT_TOKEN", () => {
  assert.deepEqual(failedIssues({ OPS_ALERTS_ENABLED: "true", TELEGRAM_CHAT_ID: "456" }), ["TELEGRAM_BOT_TOKEN"]);
});

test("OPS_ALERTS_ENABLED=true with a missing chat ID fails on TELEGRAM_CHAT_ID", () => {
  assert.deepEqual(failedIssues({ OPS_ALERTS_ENABLED: "true", TELEGRAM_BOT_TOKEN: "123:abc" }), ["TELEGRAM_CHAT_ID"]);
});

test("malformed OPS_ALERTS_ENABLED values fail preflight", () => {
  for (const value of ["TRUE", "1", "yes", "on", "typo", "0", "True", "False"]) {
    assert.deepEqual(failedIssues({ OPS_ALERTS_ENABLED: value }), ["OPS_ALERTS_ENABLED"]);
  }
});

test("parseOpsAlertsEnabled is strict and independent of product notifications", () => {
  assert.equal(parseOpsAlertsEnabled(undefined), false);
  assert.equal(parseOpsAlertsEnabled(""), false);
  assert.equal(parseOpsAlertsEnabled("true"), true);
  assert.equal(parseOpsAlertsEnabled("false"), false);
  assert.equal(parseOpsAlertsEnabled("TRUE"), undefined);
});

test("validation failures print field names only, never sentinel secrets", () => {
  const sentinel = "SENTINEL_OPERATIONAL_TOKEN";
  const result = failedIssues({ OPS_ALERTS_ENABLED: "true", TELEGRAM_BOT_TOKEN: sentinel, TELEGRAM_CHAT_ID: "chat", SITE_ADDRESS: "http://bad" });
  assert.deepEqual(result, ["SITE_ADDRESS"]);
  assert.equal(result.join(",").includes(sentinel), false);
});

test("invalid SITE_ADDRESS, APP_IMAGE_TAG, and BACKUP_DIR are rejected", () => {
  assert.deepEqual(failedIssues({ SITE_ADDRESS: "http://taxi.example.test" }), ["SITE_ADDRESS"]);
  assert.deepEqual(failedIssues({ APP_IMAGE_TAG: "" }), ["APP_IMAGE_TAG"]);
  assert.deepEqual(failedIssues({ APP_IMAGE_TAG: "latest" }), ["APP_IMAGE_TAG"]);
  assert.deepEqual(failedIssues({ BACKUP_DIR: "relative/backups" }), ["BACKUP_DIR"]);
});

test("production monitor configuration always resolves the fixed approved state directory", () => {
  assert.equal(issues({}).stateDir, "/var/lib/taxi-gps/monitor");
  assert.equal(issues({}).stateDir, DEFAULT_STATE_DIR);
});

test("inherited TAXI_GPS_MONITOR_STATE_DIR cannot redirect production state", () => {
  const previous = process.env.TAXI_GPS_MONITOR_STATE_DIR;
  process.env.TAXI_GPS_MONITOR_STATE_DIR = "/etc";
  try {
    const config = validateMonitorEnvironment({ ...process.env, ...valid });
    assert.equal(config.stateDir, DEFAULT_STATE_DIR);
  } finally {
    if (previous === undefined) delete process.env.TAXI_GPS_MONITOR_STATE_DIR;
    else process.env.TAXI_GPS_MONITOR_STATE_DIR = previous;
  }
});

test("an env-file TAXI_GPS_MONITOR_STATE_DIR entry cannot redirect production state", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "taxi-gps-monitor-env-"));
  const envFile = path.join(directory, ".env.production");
  try {
    writeFileSync(
      envFile,
      [
        "OPS_ALERTS_ENABLED=false",
        "SITE_ADDRESS=https://taxi.example.test",
        "APP_IMAGE_TAG=v1.0.0",
        "BACKUP_DIR=/srv/taxi-gps/backups",
        "TAXI_GPS_MONITOR_STATE_DIR=/etc",
      ].join("\n"),
      "utf8",
    );
    const config = validateMonitorEnvironment(loadEnvironment(envFile));
    assert.equal(config.stateDir, DEFAULT_STATE_DIR);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("direct test-level state directory injection does not change production semantics", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "taxi-gps-monitor-state-"));
  try {
    assert.equal(validateMonitorEnvironment(valid, { stateDir: directory }).stateDir, directory);
    assert.equal(validateMonitorEnvironment(valid).stateDir, DEFAULT_STATE_DIR);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("parseArguments accepts --env-file forms", () => {
  assert.equal(parseArguments(["--env-file", ".env.production"]), ".env.production");
  assert.equal(parseArguments(["--env-file=.env.production"]), ".env.production");
  assert.throws(() => parseArguments([]), /usage/);
});
