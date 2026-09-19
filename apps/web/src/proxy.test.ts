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

const historyAdminBffs = [
  "/api/system/position-history/ingestion-status",
  "/api/system/position-history/horizon-plan",
  "/api/system/position-history/population-runs/active",
  "/api/system/position-history/population-runs/recent",
  "/api/system/position-history/retention-plan",
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

async function proxyWithMe(
  path: string,
  me: () => Promise<Response>,
  cookie: string | null = "taxi_session=session-token",
  acceptLanguage?: string,
): Promise<{ response: Response; fetches: number }> {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_INTERNAL_BASE_URL;
  process.env.API_INTERNAL_BASE_URL = "http://api.test";
  let fetches = 0;
  globalThis.fetch = (async () => {
    fetches += 1;
    return me();
  }) as typeof fetch;
  try {
    const requestHeaders = new Headers();
    if (cookie !== null) requestHeaders.set("Cookie", cookie);
    if (acceptLanguage !== undefined) requestHeaders.set("Accept-Language", acceptLanguage);
    const init = cookie === null && acceptLanguage === undefined ? undefined : { headers: requestHeaders };
    const response = await proxy(new NextRequest("http://app.test" + path, init));
    return { response, fetches };
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiBaseUrl === undefined) delete process.env.API_INTERNAL_BASE_URL;
    else process.env.API_INTERNAL_BASE_URL = originalApiBaseUrl;
  }
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
  for (const path of historyAdminBffs) {
    assertAllowed(await proxyAs(path, historyUser));
    assertAllowed(await proxyAs(path, admin));
    assert.equal((await proxyAs(path, user)).status, 403);
  }
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

test("public, sibling, and permission-based product routes remain outside ADMIN classification", async () => {
  assertAllowed(await proxy(request("/login")));
  assertAllowed(await proxy(request("/admin/settings-old")));
  const sibling = await proxyWithMe("/admin/settings-old", async () => Response.json(admin));
  assertAllowed(sibling.response);
  assert.equal(sibling.fetches, 0);
  assertAllowed(await proxyAs("/map", { ...user, permissions: ["map.view"] }));
  assertRedirect(await proxyAs("/map", user), "/forbidden");
});

test("absent session cookie needs no auth fetch: pages redirect, BFF keeps 401", async () => {
  for (const path of ["/admin/settings", "/account", "/forbidden"]) {
    const { response, fetches } = await proxyWithMe(path, async () => Response.json(admin), null);
    assert.equal(fetches, 0);
    assertRedirect(response, "/login");
  }
  const bff = await proxyWithMe("/api/admin/settings", async () => Response.json(admin), null);
  assert.equal(bff.fetches, 0);
  assert.equal(bff.response.status, 401);
});

test("unavailable auth returns localized HTTP 503 for protected pages, never login", async () => {
  const failures: Array<() => Promise<Response>> = [
    async () => {
      throw new Error("private network failure");
    },
    async () => Response.json({ statusCode: 500, error: "Internal" }, { status: 500 }),
    async () => Response.json({ statusCode: 403, error: "Forbidden" }, { status: 403 }),
    async () => Response.json({ passwordHash: "must not surface" }, { status: 200 }),
  ];
  for (const me of failures) {
    const { response } = await proxyWithMe("/admin/settings", me);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("set-cookie"), null);
    const html = await response.text();
    assert.ok(html.includes("Fleet GPS"));
    assert.equal(html.includes("private network failure"), false);
    assert.equal(html.includes("passwordHash"), false);
    assert.equal(html.includes("taxi_session"), false);
    assert.ok(html.includes('href="/admin/settings"'));
  }
});

test("protected page 503 follows the request locale", async () => {
  const down = async () => {
    throw new Error("down");
  };
  const uk = await proxyWithMe("/admin/settings", down, "taxi_session=t; taxi_locale=uk");
  assert.equal(uk.response.status, 503);
  assert.match(await uk.response.text(), /\u0442\u0438\u043c\u0447\u0430\u0441\u043e\u0432\u043e \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0438\u0439/);
  const ru = await proxyWithMe("/admin/settings", down, "taxi_session=t", "ru-RU");
  assert.match(await ru.response.text(), /\u0432\u0440\u0435\u043c\u0435\u043d\u043d\u043e \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d/);
  const unsupported = await proxyWithMe("/admin/settings", down, "taxi_session=t", "pl-PL,en-US;q=0.9");
  assert.match(await unsupported.response.text(), /\u0442\u0438\u043c\u0447\u0430\u0441\u043e\u0432\u043e \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0438\u0439/);
  const en = await proxyWithMe("/admin/settings", down, "taxi_session=t; taxi_locale=en", "pl-PL");
  assert.match(await en.response.text(), /temporarily unavailable/);
  const explicitRu = await proxyWithMe("/admin/settings", down, "taxi_session=t; taxi_locale=ru", "pl-PL");
  assert.match(await explicitRu.response.text(), /\u0432\u0440\u0435\u043c\u0435\u043d\u043d\u043e \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d/);
});

test("unavailable auth returns stable JSON 503 for protected BFF routes", async () => {
  const { response } = await proxyWithMe("/api/admin/settings", async () => {
    throw new Error("private upstream body");
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { statusCode: 503, error: "Service Unavailable" });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("stale cookie 401 stays unauthenticated and never clears the session", async () => {
  const me401 = async () => Response.json({ statusCode: 401, error: "Unauthorized" }, { status: 401 });
  const page = await proxyWithMe("/admin/settings", me401);
  assertRedirect(page.response, "/login");
  assert.equal(page.response.headers.get("set-cookie"), null);
  const bff = await proxyWithMe("/api/admin/settings", me401);
  assert.equal(bff.response.status, 401);
  assert.equal(bff.response.headers.get("set-cookie"), null);
});

test("account routes need authentication but skip the forced-password redirect", async () => {
  const anon = await proxyWithMe("/account", async () => Response.json(admin), null);
  assertRedirect(anon.response, "/login");
  const down = await proxyWithMe("/account", async () => {
    throw new Error("down");
  });
  assert.equal(down.response.status, 503);
  assertAllowed(await proxyAs("/account", user));
  assertAllowed(await proxyAs("/account/change-password", { ...user, mustChangePassword: true }));
  assertAllowed(await proxyAs("/account", { ...user, mustChangePassword: true }));
});

test("forbidden stays reachable for authenticated users and 503s when unavailable", async () => {
  assertAllowed(await proxyAs("/forbidden", user));
  const anon = await proxyWithMe("/forbidden", async () => Response.json(admin), null);
  assertRedirect(anon.response, "/login");
  const down = await proxyWithMe("/forbidden", async () => {
    throw new Error("down");
  });
  assert.equal(down.response.status, 503);
});
