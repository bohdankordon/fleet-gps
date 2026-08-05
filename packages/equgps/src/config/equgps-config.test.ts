import assert from "node:assert/strict";
import test from "node:test";
import { EquGpsConfigurationError } from "../errors/equgps-errors";
import { parseEquGpsConfig, safeConfigSummary } from "./equgps-config";

const validConfig = {
  officialBaseUrl: " https://trace.example.test/api/ ",
  webBaseUrl: "https://web.example.test/",
  email: " user@example.test ",
  password: " secret-password ",
  requestTimeoutMs: 5_000,
};

test("normalizes a valid configuration without trailing slashes", () => {
  const config = parseEquGpsConfig(validConfig);
  assert.equal(config.officialBaseUrl, "https://trace.example.test/api");
  assert.equal(config.webBaseUrl, "https://web.example.test");
  assert.equal(config.email, "user@example.test");
  assert.equal(config.password, " secret-password ");
  assert.equal(config.runsRequestTimeoutMs, 45_000);
});

test("accepts a custom dedicated runs timeout", () => {
  assert.equal(parseEquGpsConfig({ ...validConfig, runsRequestTimeoutMs: 46_000 }).runsRequestTimeoutMs, 46_000);
});

test("normalizes email but preserves a password exactly", () => {
  const config = parseEquGpsConfig(validConfig);
  assert.equal(config.email, "user@example.test");
  assert.equal(config.password, " secret-password ");
});

test("accepts HTTPS paths and rejects unsafe base URLs", () => {
  assert.equal(parseEquGpsConfig(validConfig).officialBaseUrl, "https://trace.example.test/api");
  assert.throws(() => parseEquGpsConfig({ ...validConfig, officialBaseUrl: "http://trace.example.test" }), EquGpsConfigurationError);
  assert.throws(() => parseEquGpsConfig({ ...validConfig, officialBaseUrl: "https://user:pass@trace.example.test" }), EquGpsConfigurationError);
  assert.throws(() => parseEquGpsConfig({ ...validConfig, officialBaseUrl: "https://trace.example.test/api?token=value" }), EquGpsConfigurationError);
  assert.throws(() => parseEquGpsConfig({ ...validConfig, officialBaseUrl: "https://trace.example.test/api#fragment" }), EquGpsConfigurationError);
});

test("rejects invalid timeout and blank passwords without exposing them", () => {
  assert.throws(() => parseEquGpsConfig({ ...validConfig, requestTimeoutMs: 999 }), EquGpsConfigurationError);
  assert.throws(() => parseEquGpsConfig({ ...validConfig, requestTimeoutMs: 120_001 }), EquGpsConfigurationError);
  for (const runsRequestTimeoutMs of [999, 120_001, 1.5]) assert.throws(() => parseEquGpsConfig({ ...validConfig, runsRequestTimeoutMs }), EquGpsConfigurationError);
  assert.throws(() => parseEquGpsConfig({ ...validConfig, password: "" }), EquGpsConfigurationError);
  assert.throws(() => parseEquGpsConfig({ ...validConfig, password: "   " }), EquGpsConfigurationError);
  const invalidPassword = "   ";
  assert.throws(
    () => parseEquGpsConfig({ ...validConfig, password: invalidPassword }),
    (error: Error) => !error.message.includes(invalidPassword),
  );
});

test("safe configuration summary never exposes credentials", () => {
  const config = parseEquGpsConfig(validConfig);
  const summary = safeConfigSummary(config);
  const serialized = JSON.stringify(summary);
  assert.deepEqual(summary, {
    officialBaseUrl: "https://trace.example.test/api",
    webBaseUrl: "https://web.example.test",
    requestTimeoutMs: 5_000,
    runsRequestTimeoutMs: 45_000,
    hasEmail: true,
    hasPassword: true,
  });
  assert.doesNotMatch(serialized, /user@example\.test|secret-password/);
});
