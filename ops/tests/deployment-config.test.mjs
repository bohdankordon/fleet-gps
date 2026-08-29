import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { DeploymentConfigurationError, validateDeploymentEnvironment } from "../lib/deployment-config.mjs";

const repositoryRoot = path.resolve(process.cwd());
const safeBackupDirectory = process.platform === "win32" ? "C:\\taxi-gps-backups" : "/srv/taxi-gps/backups";
const valid = Object.freeze({
  POSTGRES_USER: "taxi_app",
  POSTGRES_PASSWORD: "SENTINEL_password:%/ok",
  POSTGRES_DB: "taxi_gps",
  DATABASE_URL: "postgresql://taxi_app:SENTINEL_password%3A%25%2Fok@postgres:5432/taxi_gps?schema=public",
  SITE_ADDRESS: "https://taxi.example.test",
  APP_IMAGE_TAG: "v1.0.0-e5a0f41",
  BACKUP_DIR: safeBackupDirectory,
  TELEGRAM_NOTIFICATIONS_ENABLED: "false",
  TELEGRAM_PRODUCT_LINKING_ENABLED: "false",
  TELEGRAM_PER_USER_NOTIFICATIONS_ENABLED: "false",
  TELEGRAM_PER_USER_DISPATCH_ENABLED: "false",
});

function issues(overrides) {
  try {
    validateDeploymentEnvironment({ ...valid, ...overrides }, { repositoryRoot });
    return [];
  } catch (error) {
    assert.ok(error instanceof DeploymentConfigurationError);
    const serialized = `${error.message} ${JSON.stringify(error.issues)}`;
    assert.equal(serialized.includes("SENTINEL_password"), false);
    return error.issues;
  }
}

test("valid production deployment configuration and percent-encoded matching password pass", () => {
  assert.deepEqual(validateDeploymentEnvironment(valid, { repositoryRoot }), { valid: true });
});

test("database credential and endpoint mismatches report only field names", () => {
  assert.deepEqual(issues({ POSTGRES_PASSWORD: "SENTINEL_other" }), ["DATABASE_URL", "POSTGRES_PASSWORD"]);
  assert.deepEqual(issues({ POSTGRES_USER: "other_user" }), ["DATABASE_URL", "POSTGRES_USER"]);
  assert.deepEqual(issues({ POSTGRES_DB: "other_db" }), ["DATABASE_URL", "POSTGRES_DB"]);
  assert.deepEqual(issues({ DATABASE_URL: valid.DATABASE_URL.replace("@postgres:5432", "@db:5432") }), ["DATABASE_URL"]);
  assert.deepEqual(issues({ DATABASE_URL: valid.DATABASE_URL.replace("@postgres:5432", "@postgres:5433") }), ["DATABASE_URL"]);
  assert.deepEqual(issues({ POSTGRES_PASSWORD: "" }), ["DATABASE_URL", "POSTGRES_PASSWORD"]);
  assert.deepEqual(issues({ DATABASE_URL: "postgresql://taxi_app:bad%ZZ@postgres:5432/taxi_gps" }), ["DATABASE_URL", "POSTGRES_PASSWORD"]);
});

test("SITE_ADDRESS is an HTTPS origin without credentials, query, or hash", () => {
  assert.deepEqual(issues({ SITE_ADDRESS: "http://taxi.example.test" }), ["SITE_ADDRESS"]);
  for (const value of ["https://user:pass@taxi.example.test", "https://taxi.example.test/path", "https://taxi.example.test?x=1", "https://taxi.example.test#x"]) {
    assert.deepEqual(issues({ SITE_ADDRESS: value }), ["SITE_ADDRESS"]);
  }
});

test("APP_IMAGE_TAG requires an exact safe non-latest release tag", () => {
  assert.deepEqual(issues({ APP_IMAGE_TAG: "latest" }), ["APP_IMAGE_TAG"]);
  assert.deepEqual(issues({ APP_IMAGE_TAG: "release with spaces" }), ["APP_IMAGE_TAG"]);
});

test("BACKUP_DIR must be absolute and outside the checkout", () => {
  assert.deepEqual(issues({ BACKUP_DIR: "relative/backups" }), ["BACKUP_DIR"]);
  assert.deepEqual(issues({ BACKUP_DIR: path.join(repositoryRoot, "backups") }), ["BACKUP_DIR"]);
  assert.deepEqual(issues({ BACKUP_DIR: safeBackupDirectory }), []);
});

test("optional retention values default when absent and otherwise require strict positive decimals", () => {
  assert.deepEqual(validateDeploymentEnvironment(valid, { repositoryRoot }), { valid: true });
  assert.deepEqual(issues({ BACKUP_RETENTION_DAILY: "14", BACKUP_RETENTION_WEEKLY: "8" }), []);
  for (const value of ["", "0", "-1", "garbage", "1.5", "01"]) {
    assert.deepEqual(issues({ BACKUP_RETENTION_DAILY: value }), ["BACKUP_RETENTION_DAILY"]);
    assert.deepEqual(issues({ BACKUP_RETENTION_WEEKLY: value }), ["BACKUP_RETENTION_WEEKLY"]);
  }
});

test("Telegram production wiring requires explicit safe modes and enforces cutover prerequisites without secrets", () => {
  for (const field of ["TELEGRAM_NOTIFICATIONS_ENABLED", "TELEGRAM_PRODUCT_LINKING_ENABLED", "TELEGRAM_PER_USER_NOTIFICATIONS_ENABLED", "TELEGRAM_PER_USER_DISPATCH_ENABLED"]) assert.deepEqual(issues({ [field]: undefined }), [field]);
  assert.deepEqual(issues({ TELEGRAM_PRODUCT_LINKING_ENABLED: "true" }), ["TELEGRAM_PRODUCT_BOT_TOKEN", "TELEGRAM_PRODUCT_BOT_USERNAME", "TELEGRAM_PRODUCT_WEBHOOK_SECRET"]);
  assert.deepEqual(issues({ TELEGRAM_PER_USER_DISPATCH_ENABLED: "true" }), ["TELEGRAM_PER_USER_DISPATCH_NOT_BEFORE", "TELEGRAM_PRODUCT_BOT_TOKEN"]);
  assert.deepEqual(issues({ TELEGRAM_PER_USER_DISPATCH_ENABLED: "true", TELEGRAM_PRODUCT_BOT_TOKEN: "PRODUCT_TOKEN_SENTINEL", TELEGRAM_PER_USER_DISPATCH_NOT_BEFORE: "tomorrow" }), ["TELEGRAM_PER_USER_DISPATCH_NOT_BEFORE"]);
  assert.deepEqual(issues({ TELEGRAM_NOTIFICATIONS_ENABLED: "true", TELEGRAM_BOT_TOKEN: "legacy", TELEGRAM_CHAT_ID: "legacy-chat", TELEGRAM_PER_USER_DISPATCH_ENABLED: "true", TELEGRAM_PRODUCT_BOT_TOKEN: "product", TELEGRAM_PER_USER_DISPATCH_NOT_BEFORE: "2026-08-30T14:05:00Z" }), ["TELEGRAM_NOTIFICATIONS_ENABLED", "TELEGRAM_PER_USER_DISPATCH_ENABLED"]);
  assert.deepEqual(issues({ TELEGRAM_NOTIFICATIONS_ENABLED: "false", TELEGRAM_PER_USER_NOTIFICATIONS_ENABLED: "true", TELEGRAM_PER_USER_DISPATCH_ENABLED: "true", TELEGRAM_PRODUCT_BOT_TOKEN: "product", TELEGRAM_PER_USER_DISPATCH_NOT_BEFORE: "2026-08-30T14:05:00+02:00" }), []);
});

test("OPS_ALERTS_ENABLED is independent from product Telegram notifications", () => {
  assert.deepEqual(validateDeploymentEnvironment(valid, { repositoryRoot }), { valid: true });
  assert.deepEqual(issues({ OPS_ALERTS_ENABLED: "true", TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_CHAT_ID: "456" }), []);
  assert.deepEqual(issues({ OPS_ALERTS_ENABLED: "true", TELEGRAM_CHAT_ID: "456" }), ["TELEGRAM_BOT_TOKEN"]);
  assert.deepEqual(issues({ OPS_ALERTS_ENABLED: "true", TELEGRAM_BOT_TOKEN: "123:abc" }), ["TELEGRAM_CHAT_ID"]);
  for (const value of ["TRUE", "1", "yes", "on", "typo"]) {
    assert.deepEqual(issues({ OPS_ALERTS_ENABLED: value }), ["OPS_ALERTS_ENABLED"]);
  }
});

test("OPS_ALERTS_ENABLED validation never prints Telegram token values", () => {
  const sentinel = "OPS_TOKEN_SENTINEL";
  const result = issues({ OPS_ALERTS_ENABLED: "true", TELEGRAM_BOT_TOKEN: sentinel, TELEGRAM_CHAT_ID: "chat", BACKUP_DIR: "relative" });
  assert.deepEqual(result, ["BACKUP_DIR"]);
  assert.equal(result.join(",").includes(sentinel), false);
});

test("CLI failures print field names without synthetic secret sentinels", () => {
  const sentinel = "DO_NOT_PRINT_SECRET_SENTINEL";
  const result = spawnSync(process.execPath, [path.join(repositoryRoot, "ops", "validate-env.mjs")], {
    cwd: repositoryRoot,
    env: { ...process.env, ...valid, POSTGRES_PASSWORD: sentinel },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DATABASE_URL/);
  assert.match(result.stderr, /POSTGRES_PASSWORD/);
  assert.equal(`${result.stdout}${result.stderr}`.includes(sentinel), false);
});
