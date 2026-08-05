import assert from "node:assert/strict";
import test from "node:test";
import type { SessionToken } from "../contracts/client-contracts";
import { EquGpsForbiddenError, EquGpsNetworkError, EquGpsRateLimitError, EquGpsResponseValidationError, EquGpsTimeoutError, EquGpsUnauthorizedError } from "../errors/equgps-errors";
import { SessionTokenProvider } from "./session-token-provider";
import { executeReadOnlyWithSessionToken } from "./with-session-token";

const token = (value: string): SessionToken => value as SessionToken;

test("successful read-only operation runs once", async () => {
  const provider = new SessionTokenProvider(async () => token("one"));
  let operations = 0;
  assert.equal(await executeReadOnlyWithSessionToken(provider, async () => { operations += 1; return "ok"; }), "ok");
  assert.equal(operations, 1);
});

for (const [name, error] of [["401", new EquGpsUnauthorizedError("getRuns")], ["403", new EquGpsForbiddenError("getRuns")]] as const) {
  test(`${name} refreshes once and retries once`, async () => {
    let sessions = 0;
    let operations = 0;
    const provider = new SessionTokenProvider(async () => token(`token-${++sessions}`));
    const result = await executeReadOnlyWithSessionToken(provider, async () => {
      operations += 1;
      if (operations === 1) throw error;
      return "ok";
    });
    assert.equal(result, "ok");
    assert.equal(sessions, 2);
    assert.equal(operations, 2);
  });
}

test("second authorization failure does not cause a third operation", async () => {
  let sessions = 0;
  let operations = 0;
  const provider = new SessionTokenProvider(async () => token(`token-${++sessions}`));
  await assert.rejects(() => executeReadOnlyWithSessionToken(provider, async () => {
    operations += 1;
    throw new EquGpsUnauthorizedError("getRuns");
  }), EquGpsUnauthorizedError);
  assert.equal(sessions, 2);
  assert.equal(operations, 2);
});

for (const error of [new EquGpsRateLimitError("getRuns"), new EquGpsNetworkError("getRuns"), new EquGpsTimeoutError("getRuns"), new EquGpsResponseValidationError("getRuns")]) {
  test(`${error.name} does not retry`, async () => {
    let sessions = 0;
    let operations = 0;
    const provider = new SessionTokenProvider(async () => token(`token-${++sessions}`));
    await assert.rejects(() => executeReadOnlyWithSessionToken(provider, async () => {
      operations += 1;
      throw error;
    }), error.constructor as new (...args: never[]) => Error);
    assert.equal(sessions, 1);
    assert.equal(operations, 1);
  });
}

test("parallel authorization failures share one refresh", async () => {
  let sessions = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const provider = new SessionTokenProvider(async () => {
    sessions += 1;
    if (sessions === 2) await gate;
    return token(`token-${sessions}`);
  });
  const operations = Array.from({ length: 5 }, () => executeReadOnlyWithSessionToken(provider, async (receivedToken) => {
    if (receivedToken === token("token-1")) throw new EquGpsUnauthorizedError("getRuns");
    return "ok";
  }));
  await Promise.resolve();
  release?.();
  assert.deepEqual(await Promise.all(operations), ["ok", "ok", "ok", "ok", "ok"]);
  assert.equal(sessions, 2);
});
