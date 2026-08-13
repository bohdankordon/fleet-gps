import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("retention client uses the shared taxi_session helper, GET, no-store, and no query policy", () => {
  const source = readFileSync("src/lib/position-history-retention/position-history-retention-client.ts", "utf8");
  const auth = readFileSync("src/lib/auth/auth-cookie.ts", "utf8");
  const route = readFileSync("src/app/api/system/position-history/retention-plan/route.ts", "utf8");
  assert.match(source, /authenticatedApiFetch/);
  assert.match(source, /cache: "no-store"/);
  assert.doesNotMatch(source, /method:|searchParams|\?to|cutoff=|days=/);
  assert.match(auth, /AUTH_COOKIE_NAME/);
  assert.match(auth, /Cookie/);
  assert.doesNotMatch(auth, /headers\(\).*cookie/i);
  assert.match(route, /export const GET/);
  assert.doesNotMatch(route, /POST|DELETE/);
});
