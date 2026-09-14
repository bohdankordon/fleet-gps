import assert from "node:assert/strict";
import test from "node:test";
import { ApiConfigurationError, parseApiConfig } from "./api-config";
const valid = () => ({
  EQUGPS_BASE_URL: "https://trace.example.test/api",
  EQUGPS_WEB_BASE_URL: "https://web.example.test",
  EQUGPS_EMAIL: "user@example.test",
  EQUGPS_PASSWORD: "secret",
  DATABASE_URL: "postgresql://user:password@example.test/db",
});
const productionValid = () => ({
  EQUGPS_BASE_URL: "https://trace.example.test/api",
  EQUGPS_WEB_BASE_URL: "https://web.example.test",
  EQUGPS_EMAIL: "user@example.test",
  EQUGPS_PASSWORD: "synthetic-production-provider-secret",
  DATABASE_URL: "postgresql://runtime_user:synthetic-db-secret@example.test/taxi_gps",
  NODE_ENV: "production",
});
test("continuous false with retention false remains valid", () => {
  const a = parseApiConfig({ EQUGPS_BASE_URL: "https://trace.example.test/api", EQUGPS_WEB_BASE_URL: "https://web.example.test", EQUGPS_EMAIL: "user@example.test", EQUGPS_PASSWORD: "secret", DATABASE_URL: "postgresql://user:password@example.test/db", POSITION_HISTORY_CONTINUOUS_INGESTION_ENABLED: "false", POSITION_HISTORY_RETENTION_ENABLED: "false" });
  assert.equal(a.positionHistoryContinuousIngestion?.enabled, false);
});
test("continuous false with retention true remains valid", () => {
  const a = parseApiConfig({ EQUGPS_BASE_URL: "https://trace.example.test/api", EQUGPS_WEB_BASE_URL: "https://web.example.test", EQUGPS_EMAIL: "user@example.test", EQUGPS_PASSWORD: "secret", DATABASE_URL: "postgresql://user:password@example.test/db", POSITION_HISTORY_CONTINUOUS_INGESTION_ENABLED: "false", POSITION_HISTORY_RETENTION_ENABLED: "true" });
  assert.equal(a.positionHistoryRetention?.enabled, true);
});
test("continuous true with retention true is valid for production", () => {
  const a = parseApiConfig({ EQUGPS_BASE_URL: "https://trace.example.test/api", EQUGPS_WEB_BASE_URL: "https://web.example.test", EQUGPS_EMAIL: "user@example.test", EQUGPS_PASSWORD: "synthetic-production-provider-secret", DATABASE_URL: "postgresql://runtime_user:synthetic-db-secret@example.test/taxi_gps", NODE_ENV: "production", POSITION_HISTORY_CONTINUOUS_INGESTION_ENABLED: "true", POSITION_HISTORY_RETENTION_ENABLED: "true" });
  assert.equal(a.positionHistoryContinuousIngestion?.enabled, true);
});
test("continuous true with retention false is rejected in production", () => {
  try {
    parseApiConfig({ EQUGPS_BASE_URL: "https://trace.example.test/api", EQUGPS_WEB_BASE_URL: "https://web.example.test", EQUGPS_EMAIL: "user@example.test", EQUGPS_PASSWORD: "synthetic-production-provider-secret", DATABASE_URL: "postgresql://runtime_user:synthetic-db-secret@example.test/taxi_gps", NODE_ENV: "production", POSITION_HISTORY_CONTINUOUS_INGESTION_ENABLED: "true", POSITION_HISTORY_RETENTION_ENABLED: "false" });
    assert.fail("expected rejection");
  } catch (error) {
    assert.ok(error instanceof ApiConfigurationError);
    assert.ok(error.issues.includes("POSITION_HISTORY_CONTINUOUS_INGESTION_ENABLED"));
    assert.ok(error.issues.includes("POSITION_HISTORY_RETENTION_ENABLED"));
    assert.equal(JSON.stringify(error).includes("synthetic-db-secret"), false);
  }
});
test("continuous true with retention false stays allowed outside production", () => {
  const a = parseApiConfig({ EQUGPS_BASE_URL: "https://trace.example.test/api", EQUGPS_WEB_BASE_URL: "https://web.example.test", EQUGPS_EMAIL: "user@example.test", EQUGPS_PASSWORD: "secret", DATABASE_URL: "postgresql://user:password@example.test/db", POSITION_HISTORY_CONTINUOUS_INGESTION_ENABLED: "true", POSITION_HISTORY_RETENTION_ENABLED: "false" });
  assert.equal(a.positionHistoryContinuousIngestion?.enabled, true);
});
