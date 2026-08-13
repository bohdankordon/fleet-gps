import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("execution client forwards one strict POST through the shared taxi_session helper without retry", () => {
  const source = readFileSync("src/lib/position-history-retention/position-history-retention-execution-client.ts", "utf8");
  const cookie = readFileSync("src/lib/auth/auth-cookie.ts", "utf8");
  assert.match(source, /authenticatedApiFetch/);
  assert.match(source, /retention-execute/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /cache: "no-store"/);
  assert.equal((source.match(/authenticatedApiFetch\(/g) ?? []).length, 1);
  assert.doesNotMatch(source, /retry|taxi_session|headers\(\).*cookie/i);
  assert.match(cookie, /AUTH_COOKIE_NAME/);
});
