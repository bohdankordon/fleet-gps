import assert from "node:assert/strict";
import test from "node:test";
import { parseEquGpsConfig } from "./config/equgps-config";
import { FakeHttpTransport } from "./contracts/fake-transport";
import { createOfficialEquGpsClient, createWebRunsClient } from "./factories";

const config = parseEquGpsConfig({ officialBaseUrl: "https://trace.example.test", webBaseUrl: "https://web.example.test", email: "user", password: "secret", requestTimeoutMs: 5_000 });

test("factories create default clients and use injected transports", async () => {
  assert.ok(createOfficialEquGpsClient(config));
  assert.ok(createWebRunsClient(config));
  const fake = new FakeHttpTransport(async () => ({ status: 200, headers: {}, body: [] }));
  await createOfficialEquGpsClient(config, fake).getDevices();
  assert.equal(fake.requests.length, 1);
});
