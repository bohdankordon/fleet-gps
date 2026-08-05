import assert from "node:assert/strict";
import test from "node:test";
import { ApiConfigurationError, parseApiConfig } from "./api-config";

const valid = () => ({ EQUGPS_BASE_URL: "https://trace.example.test/api", EQUGPS_WEB_BASE_URL: "https://web.example.test", EQUGPS_EMAIL: "user@example.test", EQUGPS_PASSWORD: " secret ", DATABASE_URL: "postgresql://user:password@example.test/db" });

test("API config applies safe defaults and preserves the input object", () => {
  const env = valid(); const before = { ...env };
  const config = parseApiConfig(env);
  assert.equal(config.host, "127.0.0.1"); assert.equal(config.port, 3_000); assert.equal(config.equGps.requestTimeoutMs, 15_000); assert.equal(config.equGps.runsRequestTimeoutMs, 45_000); assert.deepEqual(config.database, { url: "postgresql://user:password@example.test/db", poolMax: 10, connectionTimeoutMs: 5_000, idleTimeoutMs: 30_000 });
  assert.deepEqual(env, before); assert.equal(Object.isFrozen(config), true); assert.equal(Object.isFrozen(config.equGps), true);
});
test("API config accepts explicit valid values", () => {
  const env = { ...valid(), HOST: " localhost ", PORT: "3210", EQUGPS_REQUEST_TIMEOUT_MS: "16000", EQUGPS_RUNS_TIMEOUT_MS: "46000", DATABASE_POOL_MAX: "20", DATABASE_CONNECTION_TIMEOUT_MS: "6000", DATABASE_IDLE_TIMEOUT_MS: "40000" }; const config = parseApiConfig(env);
  assert.equal(config.host, "localhost"); assert.equal(env.HOST, " localhost "); assert.equal(config.port, 3210); assert.equal(config.equGps.requestTimeoutMs, 16000); assert.equal(config.equGps.runsRequestTimeoutMs, 46000); assert.equal(config.database.poolMax, 20); assert.equal(config.database.connectionTimeoutMs, 6000); assert.equal(config.database.idleTimeoutMs, 40000);
});
test("API config rejects invalid port, missing credentials and unsafe official URL", () => {
  for (const env of [{ ...valid(), PORT: "0" }, { ...valid(), HOST: "   " }, { ...valid(), EQUGPS_EMAIL: "" }, { ...valid(), EQUGPS_BASE_URL: "http://trace.example.test" }, { ...valid(), DATABASE_URL: "" }, { ...valid(), DATABASE_POOL_MAX: "0" }, { ...valid(), DATABASE_CONNECTION_TIMEOUT_MS: "99" }, { ...valid(), DATABASE_IDLE_TIMEOUT_MS: "999" }]) {
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
    assert.throws(() => parseApiConfig(env), (error: unknown) => { assert.ok(error instanceof ApiConfigurationError); assert.deepEqual(error.issues, expected); return true; });
  }
});
test("API configuration errors do not serialize secrets or environment values", () => {
  const email = "private@example.test", password = "private password", url = "https://trace.example.test/?token=private";
  try { parseApiConfig({ ...valid(), EQUGPS_EMAIL: email, EQUGPS_PASSWORD: password, EQUGPS_BASE_URL: url }); assert.fail("expected configuration error"); }
  catch (error) { assert.ok(error instanceof ApiConfigurationError); const text = `${error.message} ${JSON.stringify(error)}`; assert.equal(text.includes(email), false); assert.equal(text.includes(password), false); assert.equal(text.includes(url), false); }
});
