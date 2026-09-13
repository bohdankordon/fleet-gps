import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import type { AuthUser } from "./lib/auth/auth-contract";
import { proxy } from "./proxy";

const admin: AuthUser = { id: "admin-id", login: "admin", role: "ADMIN", permissions: [], mustChangePassword: false };
const user: AuthUser = { id: "user-id", login: "operator", role: "USER", permissions: [], mustChangePassword: false };

const administrationPages = [
  "/admin/users",
  "/admin/users/new",
  "/admin/users/user-id",
  "/admin/settings",
  "/admin/audit",
  "/admin/history",
  "/admin/history/population",
  "/admin/history/retention",
] as const;

const adminOnlyBffs = [
  "/api/admin/users",
  "/api/admin/users/user-id/disable",
  "/api/admin/settings",
  "/api/admin/audit",
  "/api/system/position-history/retention-execute",
] as const;

function request(path: string, authenticated = false): NextRequest {
  return new NextRequest(`http://app.test${path}`, authenticated ? { headers: { Cookie: "taxi_session=session-token" } } : undefined);
}

async function proxyAs(path: string, authUser: AuthUser): Promise<Response> {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_INTERNAL_BASE_URL;
  process.env.API_INTERNAL_BASE_URL = "http://api.test";
  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), "http://api.test/api/auth/me");
    assert.equal(new Headers(init?.headers).get("Cookie"), "taxi_session=session-token");
    return Response.json(authUser);
  }) as typeof fetch;
  try {
    return await proxy(request(path, true));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiBaseUrl === undefined) delete process.env.API_INTERNAL_BASE_URL;
    else process.env.API_INTERNAL_BASE_URL = originalApiBaseUrl;
  }
}

function assertRedirect(response: Response, destination: string): void {
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), `http://app.test${destination}`);
}

function assertAllowed(response: Response): void {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
}

test("all accepted Administration pages receive direct unauthenticated proxy redirects", async () => {
  for (const path of administrationPages) assertRedirect(await proxy(request(path)), "/login");
});

test("ordinary USER and ADMIN behavior covers every accepted Administration page", async () => {
  for (const path of administrationPages) {
    assertRedirect(await proxyAs(path, user), "/forbidden");
    assertAllowed(await proxyAs(path, admin));
  }
});

test("forced password change takes precedence for USER and ADMIN Administration access", async () => {
  for (const path of administrationPages) {
    assertRedirect(await proxyAs(path, { ...user, mustChangePassword: true }), "/account/change-password");
    assertRedirect(await proxyAs(path, { ...admin, mustChangePassword: true }), "/account/change-password");
  }
});

test("permission-owned History routes remain available to an authorized USER while Retention remains ADMIN-only", async () => {
  const historyUser: AuthUser = { ...user, permissions: ["historyAdmin.view"] };
  assertAllowed(await proxyAs("/admin/history", historyUser));
  assertAllowed(await proxyAs("/admin/history/population", historyUser));
  assertRedirect(await proxyAs("/admin/history/retention", historyUser), "/forbidden");
});

test("Administration BFFs use the same unauthenticated, USER, ADMIN, and forced-password precedence", async () => {
  for (const path of adminOnlyBffs) {
    assert.equal((await proxy(request(path))).status, 401);
    assert.equal((await proxyAs(path, user)).status, 403);
    assertAllowed(await proxyAs(path, admin));
    assert.equal((await proxyAs(path, { ...user, mustChangePassword: true })).status, 403);
    assert.equal((await proxyAs(path, { ...admin, mustChangePassword: true })).status, 403);
  }
});

test("public, Account, and permission-based product routes remain outside ADMIN classification", async () => {
  assertAllowed(await proxy(request("/login")));
  assertAllowed(await proxy(request("/account")));
  assertAllowed(await proxyAs("/map", { ...user, permissions: ["map.view"] }));
  assertRedirect(await proxyAs("/map", user), "/forbidden");
});
