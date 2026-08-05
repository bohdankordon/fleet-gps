import assert from "node:assert/strict";
import test from "node:test";
import type { SessionToken } from "../contracts/client-contracts";
import { SessionTokenProvider } from "./session-token-provider";

const token = (value: string): SessionToken => value as SessionToken;

test("first request creates a token and subsequent request uses the cache", async () => {
  let calls = 0;
  const provider = new SessionTokenProvider(async () => { calls += 1; return token("first"); });
  assert.equal(await provider.getToken(), token("first"));
  assert.equal(await provider.getToken(), token("first"));
  assert.equal(calls, 1);
});

test("ten concurrent requests share one single-flight session creation", async () => {
  let calls = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const provider = new SessionTokenProvider(async () => {
    calls += 1;
    await gate;
    return token("shared");
  });
  const requests = Array.from({ length: 10 }, () => provider.getToken());
  await Promise.resolve();
  assert.equal(calls, 1);
  release?.();
  assert.deepEqual(await Promise.all(requests), Array.from({ length: 10 }, () => token("shared")));
});

test("a failed session creation is not cached and a later call can succeed", async () => {
  let calls = 0;
  const provider = new SessionTokenProvider(async () => {
    calls += 1;
    if (calls === 1) throw new Error("session failed");
    return token("recovered");
  });
  await assert.rejects(() => provider.getToken());
  assert.equal(await provider.getToken(), token("recovered"));
  assert.equal(calls, 2);
});

test("invalidation removes only the expected current token", async () => {
  let calls = 0;
  const provider = new SessionTokenProvider(async () => token(`token-${++calls}`));
  const oldToken = await provider.getToken();
  provider.invalidateToken(oldToken);
  const newToken = await provider.getToken();
  provider.invalidateToken(oldToken);
  assert.equal(await provider.getToken(), newToken);
  provider.invalidateToken();
  assert.notEqual(await provider.getToken(), newToken);
});

test("provider serialization does not expose the token", async () => {
  const provider = new SessionTokenProvider(async () => token("not-for-json"));
  await provider.getToken();
  assert.doesNotMatch(JSON.stringify(provider), /not-for-json/);
});
