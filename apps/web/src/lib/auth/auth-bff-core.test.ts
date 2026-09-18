import assert from "node:assert/strict";
import test from "node:test";
import { forwardAuthToUpstream } from "./auth-bff-core";

const safeUser = { id: "00000000-0000-4000-8000-000000000001", login: "operator", role: "ADMIN", permissions: [], mustChangePassword: false } as const;
const localSessionCookie = `taxi_session=${"a".repeat(43)}; Max-Age=604800; HttpOnly; SameSite=Lax; Path=/`;

function logoutRequest(cookie = "taxi_session=raw-token; preference=dark"): Request { return new Request("http://app.test/api/auth/logout", { method: "POST", headers: { Cookie: cookie, Origin: "http://app.test" } }); }
function assertOnlyAuthCookieCleared(response: Response): void { const cookie = response.headers.get("set-cookie") ?? ""; assert.match(cookie, /^taxi_session=;/); assert.match(cookie, /Max-Age=0/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Path=\//); assert.doesNotMatch(cookie, /preference|unrelated|taxi_locale/); }

test("normal logout preserves upstream success, clears only auth, and leaves the locale preference intact", async () => { let upstreamCookie = ""; const response = await forwardAuthToUpstream(logoutRequest("taxi_session=raw-token; taxi_locale=ru; preference=dark"), "/api/auth/logout", "http://api.test", [], async (_input, init) => { upstreamCookie = new Headers(init?.headers).get("cookie") ?? ""; return Response.json({ ok: true }, { status: 200, headers: { "Set-Cookie": "taxi_session=upstream-clear" } }); }, false); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true }); assert.equal(upstreamCookie, "taxi_session=raw-token"); assertOnlyAuthCookieCleared(response); });
test("upstream 401 logout preserves 401 body while still clearing taxi_session", async () => { const response = await forwardAuthToUpstream(logoutRequest("taxi_session=expired; unrelated=keep"), "/api/auth/logout", "http://api.test", [], async () => Response.json({ statusCode: 401, error: "Unauthorized" }, { status: 401 }), false); assert.equal(response.status, 401); assert.deepEqual(await response.json(), { statusCode: 401, error: "Unauthorized" }); assertOnlyAuthCookieCleared(response); });
test("logout never forwards or clears unrelated cookies", async () => { let upstreamCookie = ""; const response = await forwardAuthToUpstream(logoutRequest("unrelated=keep"), "/api/auth/logout", "http://api.test", [], async (_input, init) => { upstreamCookie = new Headers(init?.headers).get("cookie") ?? ""; return Response.json({ statusCode: 401, error: "Unauthorized" }, { status: 401 }); }, false); assert.equal(upstreamCookie, ""); assertOnlyAuthCookieCleared(response); });

test("repeated stable-release login and logout cycles rotate only the session cookie", async () => {
  const paths: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    return path.endsWith("/logout")
      ? Response.json({ ok: true })
      : Response.json(safeUser, { headers: { "Set-Cookie": localSessionCookie } });
  };
  for (let cycle = 0; cycle < 2; cycle += 1) {
    const login = await forwardAuthToUpstream(new Request("http://app.test/api/auth/login", { method: "POST", headers: { Origin: "http://app.test", "Content-Type": "application/json" }, body: JSON.stringify({ login: "operator", password: "private-password" }) }), "/api/auth/login", "http://api.test", ["login", "password"], fetcher, false);
    assert.equal(login.status, 200);
    assert.equal(login.headers.get("set-cookie"), localSessionCookie);

    const logout = await forwardAuthToUpstream(logoutRequest("taxi_session=rotated-token; taxi_locale=en"), "/api/auth/logout", "http://api.test", [], fetcher, false);
    assert.equal(logout.status, 200);
    assertOnlyAuthCookieCleared(logout);
  }
  assert.deepEqual(paths, ["/api/auth/login", "/api/auth/logout", "/api/auth/login", "/api/auth/logout"]);
});

test("native login POST is normalized to the existing JSON BFF flow without credential query parameters", async () => {
  const request = new Request("http://app.test/api/auth/login", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" }, body: new URLSearchParams({ login: "operator", password: "private-password" }) });
  let upstreamUrl = ""; let upstreamInit: RequestInit | undefined;
  const response = await forwardAuthToUpstream(request, "/api/auth/login", "http://api.test", ["login", "password"], async (input, init) => { upstreamUrl = String(input); upstreamInit = init; return Response.json(safeUser, { headers: { "Set-Cookie": localSessionCookie } }); }, false);
  assert.equal(response.status, 200);
  assert.equal(upstreamUrl, "http://api.test/api/auth/login");
  assert.equal(new URL(upstreamUrl).search, "");
  assert.equal(upstreamInit?.method, "POST");
  assert.equal(new Headers(upstreamInit?.headers).get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(String(upstreamInit?.body)), { login: "operator", password: "private-password" });
});

test("missing evidence and cross-origin writes are rejected before auth upstream execution", async () => {
  let calls = 0;
  for (const origin of [undefined, "https://evil.test"]) {
    const headers = new Headers(); if (origin) headers.set("Origin", origin);
    const response = await forwardAuthToUpstream(new Request("http://app.test/api/auth/login", { method: "POST", headers }), "/api/auth/login", "http://api.test", [], async () => { calls += 1; return Response.json({ ok: true }); });
    assert.equal(response.status, 403);
  }
  assert.equal(calls, 0);
});
test("the exact supported Chromium login request reaches the Nest authentication layer", async () => { let calls = 0; const request = new Request("http://localhost:3000/api/auth/login", { method: "POST", headers: { Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" }, body: JSON.stringify({ login: "operator", password: "test-only-value" }) }); const response = await forwardAuthToUpstream(request, "/api/auth/login", "http://api.test", ["login", "password"], async () => { calls += 1; return Response.json({ statusCode: 401, error: "Unauthorized" }, { status: 401 }); }); assert.equal(response.status, 401); assert.equal(calls, 1); });
test("same-origin change-password reaches the existing protected upstream flow", async () => { let calls = 0; const request = new Request("http://app.test/api/auth/change-password", { method: "POST", headers: { Origin: "http://app.test", Cookie: "taxi_session=token", "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: "current", newPassword: "next-password-value" }) }); const response = await forwardAuthToUpstream(request, "/api/auth/change-password", "http://api.test", ["currentPassword", "newPassword"], async () => { calls += 1; return Response.json(safeUser, { headers: { "Set-Cookie": localSessionCookie } }); }); assert.equal(response.status, 200); assert.equal(calls, 1); });

test("change-password forwards only allowlisted policy reasons", async () => {
  const request = () => new Request("http://app.test/api/auth/change-password", { method: "POST", headers: { Origin: "http://app.test", Cookie: "taxi_session=token", "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: "current", newPassword: "next-password-value" }) });
  for (const reason of ["LENGTH", "COMMON_OR_PREDICTABLE", "SAME_AS_CURRENT"]) {
    const response = await forwardAuthToUpstream(request(), "/api/auth/change-password", "http://api.test", ["currentPassword", "newPassword"], async () => Response.json({ statusCode: 400, error: "PASSWORD_POLICY", reason, message: "must not pass" }, { status: 400 }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { statusCode: 400, error: "PASSWORD_POLICY", reason });
  }
  const unsafe = await forwardAuthToUpstream(request(), "/api/auth/change-password", "http://api.test", ["currentPassword", "newPassword"], async () => Response.json({ statusCode: 400, error: "PASSWORD_POLICY", reason: "PRIVATE_DETAIL", password: "secret" }, { status: 400 }));
  assert.deepEqual(await unsafe.json(), { statusCode: 400, error: "Bad Request" });
});

test("login 429 and unexpected upstream failures are reduced to safe stable bodies", async () => {
  const request = () => new Request("http://app.test/api/auth/login", { method: "POST", headers: { Origin: "http://app.test", "Content-Type": "application/json" }, body: JSON.stringify({ login: "operator", password: "private" }) });
  const limited = await forwardAuthToUpstream(request(), "/api/auth/login", "http://api.test", ["login", "password"], async () => Response.json({ error: "LOGIN_RATE_LIMITED", stack: "SECRET_SENTINEL" }, { status: 429 }));
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { statusCode: 429, error: "LOGIN_RATE_LIMITED" });
  const failed = await forwardAuthToUpstream(request(), "/api/auth/login", "http://api.test", ["login", "password"], async () => Response.json({ stack: "SECRET_SENTINEL", database: "private" }, { status: 500 }));
  assert.equal(failed.status, 503);
  assert.equal((await failed.text()).includes("SECRET_SENTINEL"), false);
});

test("oversized login body is rejected before upstream auth work", async () => {
  let calls = 0;
  const request = new Request("http://app.test/api/auth/login", { method: "POST", headers: { Origin: "http://app.test", "Content-Type": "application/json" }, body: JSON.stringify({ login: "operator", password: "x".repeat(70_000) }) });
  const response = await forwardAuthToUpstream(request, "/api/auth/login", "http://api.test", ["login", "password"], async () => { calls += 1; return Response.json(safeUser); });
  assert.equal(response.status, 413);
  assert.equal(calls, 0);
});

test("/me preserves valid 200, 401, safe 503 and 502 without raw bodies", async () => {
  const me = () => new Request("http://app.test/api/auth/me", { headers: { Cookie: "taxi_session=token" } });
  const ok = await forwardAuthToUpstream(me(), "/api/auth/me", "http://api.test", [], async () => Response.json(safeUser));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), safeUser);
  const unauthenticated = await forwardAuthToUpstream(me(), "/api/auth/me", "http://api.test", [], async () => Response.json({ statusCode: 401 }, { status: 401 }));
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(await unauthenticated.json(), { statusCode: 401, error: "Unauthorized" });
  const failed = await forwardAuthToUpstream(me(), "/api/auth/me", "http://api.test", [], async () => Response.json({ stack: "SECRET_SENTINEL" }, { status: 500 }));
  assert.equal(failed.status, 503);
  assert.equal((await failed.text()).includes("SECRET_SENTINEL"), false);
  const network = await forwardAuthToUpstream(me(), "/api/auth/me", "http://api.test", [], async () => {
    throw new Error("private network failure");
  });
  assert.equal(network.status, 503);
  const malformed = await forwardAuthToUpstream(me(), "/api/auth/me", "http://api.test", [], async () => Response.json({ passwordHash: "must not surface" }));
  assert.equal(malformed.status, 502);
  assert.equal((await malformed.text()).includes("passwordHash"), false);
});

test("production refuses an insecure or domain-scoped upstream auth cookie", async () => {
  const request = () => new Request("https://app.test/api/auth/login", { method: "POST", headers: { Origin: "https://app.test", "Content-Type": "application/json" }, body: JSON.stringify({ login: "operator", password: "private" }) });
  for (const cookie of [localSessionCookie, `${localSessionCookie}; Secure; Domain=app.test`]) {
    const response = await forwardAuthToUpstream(request(), "/api/auth/login", "http://api.test", ["login", "password"], async () => Response.json(safeUser, { headers: { "Set-Cookie": cookie } }), true);
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  const secure = await forwardAuthToUpstream(request(), "/api/auth/login", "http://api.test", ["login", "password"], async () => Response.json(safeUser, { headers: { "Set-Cookie": `${localSessionCookie}; Secure` } }), true);
  assert.equal(secure.status, 200);
  assert.match(secure.headers.get("set-cookie") ?? "", /; Secure$/);
});
