import assert from "node:assert/strict";
import test from "node:test";
import { ApiConfigurationError, parseApiConfig } from "./api-config";

const valid = () => ({ EQUGPS_BASE_URL: "https://trace.example.test/api", EQUGPS_WEB_BASE_URL: "https://web.example.test", EQUGPS_EMAIL: "user@example.test", EQUGPS_PASSWORD: " secret " });

test("API config applies safe defaults and preserves the input object", () => {
  const env = valid(); const before = { ...env };
  const config = parseApiConfig(env);
  assert.equal(config.host, "127.0.0.1"); assert.equal(config.port, 3_000); assert.equal(config.equGps.requestTimeoutMs, 15_000);
  assert.deepEqual(env, before); assert.equal(Object.isFrozen(config), true); assert.equal(Object.isFrozen(config.equGps), true);
});
test("API config accepts explicit valid values", () => {
  const config = parseApiConfig({ ...valid(), HOST: "localhost", PORT: "3210", EQUGPS_REQUEST_TIMEOUT_MS: "16000" });
  assert.equal(config.host, "localhost"); assert.equal(config.port, 3210); assert.equal(config.equGps.requestTimeoutMs, 16000);
});
test("API config rejects invalid port, missing credentials and unsafe official URL", () => {
  for (const env of [{ ...valid(), PORT: "0" }, { ...valid(), PORT: "x" }, { ...valid(), EQUGPS_EMAIL: "" }, { ...valid(), EQUGPS_PASSWORD: "" }, { ...valid(), EQUGPS_BASE_URL: "http://trace.example.test" }]) {
    assert.throws(() => parseApiConfig(env), ApiConfigurationError);
  }
});
test("API configuration errors do not serialize secrets or environment values", () => {
  const email = "private@example.test", password = "private password", url = "https://trace.example.test/?token=private";
  try { parseApiConfig({ ...valid(), EQUGPS_EMAIL: email, EQUGPS_PASSWORD: password, EQUGPS_BASE_URL: url }); assert.fail("expected configuration error"); }
  catch (error) { assert.ok(error instanceof ApiConfigurationError); const text = `${error.message} ${JSON.stringify(error)}`; assert.equal(text.includes(email), false); assert.equal(text.includes(password), false); assert.equal(text.includes(url), false); }
});
