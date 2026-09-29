import assert from "node:assert/strict";
import test from "node:test";
import { postAuthDestination, parseReturnTo, tripEventLoginRedirect, tripEventReturnTo } from "./return-to";
import type { AuthUser } from "./auth-contract";

const vehicle = "00000000-0000-4000-8000-000000000001";
const event = "00000000-0000-4000-8000-000000000002";
const path = `/vehicles/${vehicle}/trips?from=2026-09-29T11%3A30%3A00.000Z&to=2026-09-29T12%3A15%3A00.000Z&event=${event}`;
const user: AuthUser = { id: "user", login: "user", role: "USER", permissions: ["events.view"], mustChangePassword: false };

test("valid event investigation survives login as a canonical relative URL", () => {
  assert.equal(parseReturnTo(path), path);
  assert.equal(postAuthDestination(user, path), path);
  const fromPage = tripEventReturnTo(vehicle, { from: "2026-09-29T11:30:00Z", to: "2026-09-29T12:15:00Z", event });
  assert.equal(fromPage, path);
  assert.equal(new URL(tripEventLoginRedirect(fromPage, "unauthenticated")!, "https://fleet.example.test").searchParams.get("returnTo"), path);
  assert.equal(tripEventLoginRedirect(fromPage, "authenticated"), null);
  assert.equal(tripEventLoginRedirect(fromPage, "unavailable"), null);
});

test("unsafe or malformed returnTo falls back to the existing landing", () => {
  for (const value of ["", "//evil.example", "https://evil.example/path", "http://evil.example/path", "\\\\evil.example", "javascript:alert(1)", "data:text/html,evil", "/login", "/vehicles/not-a-uuid/trips?event=x", `${path}&token=secret`, `${path}#other`, `/vehicles/${vehicle}/trips?from=x&to=y&event=${event}`]) {
    assert.equal(parseReturnTo(value), null, value);
    assert.equal(postAuthDestination(user, value), "/events", value);
  }
  assert.equal(tripEventReturnTo(vehicle, { from: ["duplicate"], to: "x", event }), null);
});

test("forced password change takes priority over a valid returnTo", () => {
  assert.equal(postAuthDestination({ ...user, mustChangePassword: true }, path), "/account/change-password");
  assert.equal(postAuthDestination({ ...user, role: "ADMIN" }, path), path);
  assert.equal(postAuthDestination({ ...user, role: "ADMIN" }, "//evil.example"), "/");
});
