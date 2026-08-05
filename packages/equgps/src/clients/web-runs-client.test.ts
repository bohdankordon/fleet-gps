import assert from "node:assert/strict";
import test from "node:test";
import { parseEquGpsConfig } from "../config/equgps-config";
import type { SessionToken } from "../contracts/client-contracts";
import { FakeHttpTransport } from "../contracts/fake-transport";
import { EquGpsResponseValidationError } from "../errors/equgps-errors";
import { EquGpsTimeoutError } from "../errors/equgps-errors";
import { classifyRunsValidationFailure, DefaultWebRunsClient } from "./web-runs-client";

const config = parseEquGpsConfig({ officialBaseUrl: "https://trace.example.test", webBaseUrl: "https://web.example.test", email: "user", password: "secret", requestTimeoutMs: 5_000 });
const token = "test-token" as SessionToken;

test("runs uses allowlisted POST without Content-Type and normalizes the array", async () => {
  const client = new DefaultWebRunsClient(config, new FakeHttpTransport(async (request) => {
    const url = new URL(request.url);
    assert.equal(request.method, "POST");
    assert.equal(url.pathname, "/api/devices/runs");
    assert.equal(url.searchParams.get("token"), token);
    assert.equal(request.headers["Content-Type"], undefined);
    assert.equal(request.timeoutMs, 45_000);
    return { status: 200, headers: {}, body: [{ id: 1, runDistance: 12 }] };
  }));
  assert.deepEqual(await client.getRuns(token), [{ deviceId: 1, distanceMeters: 12 }]);
});

test("runs uses only its dedicated timeout and does not retry a timeout", async () => {
  const custom = parseEquGpsConfig({ officialBaseUrl: "https://trace.example.test", webBaseUrl: "https://web.example.test", email: "user", password: "secret", requestTimeoutMs: 5_000, runsRequestTimeoutMs: 46_000 });
  let requests = 0;
  const client = new DefaultWebRunsClient(custom, new FakeHttpTransport(async (request) => { requests += 1; assert.equal(request.timeoutMs, 46_000); throw new EquGpsTimeoutError("getRuns"); }));
  await assert.rejects(() => client.getRuns(token), (error: Error) => error instanceof EquGpsTimeoutError && error.operation === "getRuns");
  assert.equal(requests, 1);
});

test("runs validation exposes only closed diagnostic categories without secrets", async () => {
  const cases: readonly [unknown, string][] = [
    [[{ id: 1, runDistance: -1 }], "runs_invalid_distance"],
    [[{ id: 0, runDistance: 1 }], "runs_invalid_id"],
    [[{ id: 1, runDistance: 1 }, "not-object"], "runs_item_not_object"],
    [[{ id: 1 }], "runs_invalid_distance"],
    [[{ id: "1", runDistance: 1 }], "runs_invalid_id"],
    [[{ id: 1, runDistance: Number.POSITIVE_INFINITY }], "runs_invalid_distance"],
    [[{ id: 1, runDistance: 1 }, []], "runs_item_not_object"],
    [null, "runs_not_array"],
  ];
  for (const [body, code] of cases) {
    const client = new DefaultWebRunsClient(config, new FakeHttpTransport(async () => ({ status: 200, headers: {}, body })));
    await assert.rejects(() => client.getRuns(token), (error: Error) => error instanceof EquGpsResponseValidationError && error.diagnosticCode === code && !JSON.stringify(error).includes("test-token"));
  }
});

test("runs diagnostic classifier has a closed fallback for unexpected shapes", () => {
  assert.equal(classifyRunsValidationFailure([{ id: 1, runDistance: 1 }]), "unexpected_response_shape");
});

test("runs identifiers must be positive", async () => {
  for (const id of [0, -1]) {
    const client = new DefaultWebRunsClient(config, new FakeHttpTransport(async () => ({ status: 200, headers: {}, body: [{ id, runDistance: 1 }] })));
    await assert.rejects(() => client.getRuns(token), EquGpsResponseValidationError);
  }
});
