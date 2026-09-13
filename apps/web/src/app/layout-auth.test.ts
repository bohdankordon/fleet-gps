import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const layoutSource = readFileSync("src/app/layout.tsx", "utf8");
const providerSource = readFileSync("src/components/auth-provider.tsx", "utf8");

test("root layout consumes the explicit auth resolution", () => {
  assert.match(layoutSource, /resolveAuthUser\(\)/);
  assert.doesNotMatch(layoutSource, /getAuthUser/);
});

test("auth provider stays a two-state presentation context", () => {
  assert.match(layoutSource, /resolution\.kind === "authenticated" \? resolution\.user : null/);
  assert.match(providerSource, /createContext<AuthUser \| null>/);
  assert.doesNotMatch(providerSource, /unavailable|AuthResolution/);
  assert.match(layoutSource, /<AuthProvider user=\{user\}>/);
});

test("unavailable never becomes a no-access identity", () => {
  assert.doesNotMatch(layoutSource, /no-access/);
  assert.match(layoutSource, /resolveAuthUser/);
});
