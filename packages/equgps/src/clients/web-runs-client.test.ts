import assert from "node:assert/strict";
import test from "node:test";
import { parseEquGpsConfig } from "../config/equgps-config";
import type { SessionToken } from "../contracts/client-contracts";
import { FakeHttpTransport } from "../contracts/fake-transport";
import { EquGpsResponseValidationError } from "../errors/equgps-errors";
import { DefaultWebRunsClient } from "./web-runs-client";

const config = parseEquGpsConfig({ officialBaseUrl: "https://trace.example.test", webBaseUrl: "https://web.example.test", email: "user", password: "secret", requestTimeoutMs: 5_000 });
const token = "test-token" as SessionToken;

test("runs uses allowlisted POST without Content-Type and normalizes the array", async () => {
  const client = new DefaultWebRunsClient(config, new FakeHttpTransport(async (request) => {
    const url = new URL(request.url);
    assert.equal(request.method, "POST");
    assert.equal(url.pathname, "/api/devices/runs");
    assert.equal(url.searchParams.get("token"), token);
    assert.equal(request.headers["Content-Type"], undefined);
    return { status: 200, headers: {}, body: [{ id: 1, runDistance: 12 }] };
  }));
  assert.deepEqual(await client.getRuns(token), [{ deviceId: 1, distanceMeters: 12 }]);
});

test("invalid runs distance fails without token in the error", async () => {
  const client = new DefaultWebRunsClient(config, new FakeHttpTransport(async () => ({ status: 200, headers: {}, body: [{ id: 1, runDistance: -1 }] })));
  await assert.rejects(() => client.getRuns(token), (error: Error) => error instanceof EquGpsResponseValidationError && !JSON.stringify(error).includes("test-token"));
});

test("runs identifiers must be positive", async () => {
  for (const id of [0, -1]) {
    const client = new DefaultWebRunsClient(config, new FakeHttpTransport(async () => ({ status: 200, headers: {}, body: [{ id, runDistance: 1 }] })));
    await assert.rejects(() => client.getRuns(token), EquGpsResponseValidationError);
  }
});
