import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LOGIN_RATE_LIMIT_BLOCK_MS, LOGIN_RATE_LIMIT_FAILURES, LOGIN_RATE_LIMIT_MAX_ENTRIES, LOGIN_RATE_LIMIT_WINDOW_MS, LoginRateLimiter } from "./login-rate-limiter";

test("fifth failure activates one fixed fifteen-minute block and blocked checks do not extend it", () => {
  let now = 0;
  const limiter = new LoginRateLimiter({ now: () => now });
  for (let attempt = 1; attempt < LOGIN_RATE_LIMIT_FAILURES; attempt += 1) {
    assert.equal(limiter.isBlocked("operator"), false);
    limiter.recordFailure("operator");
    assert.equal(limiter.isBlocked("operator"), false);
  }
  limiter.recordFailure("operator");
  assert.equal(limiter.isBlocked("operator"), true);
  now += LOGIN_RATE_LIMIT_BLOCK_MS - 1;
  assert.equal(limiter.isBlocked("operator"), true);
  now += 1;
  assert.equal(limiter.isBlocked("operator"), false);
  assert.equal(limiter.size, 0);
});

test("success clearing and sliding failure-window expiry remove a login bucket", () => {
  let now = 10;
  const limiter = new LoginRateLimiter({ now: () => now });
  limiter.recordFailure("operator");
  limiter.clear("operator");
  assert.equal(limiter.size, 0);
  limiter.recordFailure("operator");
  now += LOGIN_RATE_LIMIT_WINDOW_MS;
  assert.equal(limiter.isBlocked("operator"), false);
  assert.equal(limiter.size, 0);
});

test("capacity is bounded and deterministic LRU-style eviction removes the oldest entry", () => {
  let now = 0;
  const limiter = new LoginRateLimiter({ now: () => now, maxEntries: 2 });
  for (let attempt = 0; attempt < 4; attempt += 1) limiter.recordFailure("oldest");
  now += 1; limiter.recordFailure("newer");
  now += 1; limiter.recordFailure("newest");
  assert.equal(limiter.size, 2);
  limiter.recordFailure("oldest");
  assert.equal(limiter.isBlocked("oldest"), false);
  assert.equal(limiter.size, 2);
  assert.equal(LOGIN_RATE_LIMIT_MAX_ENTRIES, 10_000);
});

test("expired entries are reclaimed before live-entry eviction", () => {
  let now = 0;
  const limiter = new LoginRateLimiter({ now: () => now, maxEntries: 2 });
  limiter.recordFailure("expired");
  now += LOGIN_RATE_LIMIT_WINDOW_MS;
  limiter.recordFailure("live-a");
  limiter.recordFailure("live-b");
  assert.equal(limiter.size, 2);
  limiter.recordFailure("expired");
  assert.equal(limiter.isBlocked("expired"), false);
});

test("limiter is process-only and has no database, Redis, IP, or forwarded-header authority", () => {
  const source = readFileSync("src/modules/auth/login-rate-limiter.ts", "utf8");
  assert.doesNotMatch(source, /Prisma|Redis|X-Forwarded-For|Forwarded|request|clientIp/i);
});
