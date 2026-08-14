import assert from "node:assert/strict";
import test from "node:test";
import { browserSecurityHeaders, contentSecurityPolicy } from "./security-headers";

test("production CSP is centralized, denies framing, has no wildcard or unsafe-eval, and scopes OpenFreeMap to connect-src", () => {
  const csp = contentSecurityPolicy(true);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /worker-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(csp, /(?:^|\s)\*(?:\s|;|$)/);
  assert.equal((csp.match(/https:\/\/tiles\.openfreemap\.org/g) ?? []).length, 1);
  assert.match(csp, /connect-src[^;]*https:\/\/tiles\.openfreemap\.org/);
  assert.doesNotMatch(csp, /mapbox|google|routing|geocod/i);
});

test("required browser protection headers are present with exact production values", () => {
  const headers = Object.fromEntries(browserSecurityHeaders(true).map(({ key, value }) => [key, value]));
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.match(headers["Permissions-Policy"] ?? "", /camera=\(\)/);
  assert.match(headers["Content-Security-Policy"] ?? "", /default-src 'self'/);
});

test("development-only eval and websocket allowances never enter the production policy", () => {
  assert.match(contentSecurityPolicy(false), /'unsafe-eval'/);
  assert.match(contentSecurityPolicy(false), /ws:/);
  assert.doesNotMatch(contentSecurityPolicy(true), /unsafe-eval|(?:^|\s)wss?:/);
});
