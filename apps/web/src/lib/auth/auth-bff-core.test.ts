import assert from "node:assert/strict";
import test from "node:test";
import { forwardAuthToUpstream } from "./auth-bff-core";

function logoutRequest(cookie = "taxi_session=raw-token; preference=dark"): Request { return new Request("http://app.test/api/auth/logout", { method: "POST", headers: { Cookie: cookie } }); }
function assertOnlyAuthCookieCleared(response: Response): void { const cookie = response.headers.get("set-cookie") ?? ""; assert.match(cookie, /^taxi_session=;/); assert.match(cookie, /Max-Age=0/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Path=\//); assert.doesNotMatch(cookie, /preference|unrelated/); }

test("normal logout preserves upstream success and always clears the browser auth cookie", async () => { let upstreamCookie = ""; const response = await forwardAuthToUpstream(logoutRequest(), "/api/auth/logout", "http://api.test", [], async (_input, init) => { upstreamCookie = new Headers(init?.headers).get("cookie") ?? ""; return Response.json({ ok: true }, { status: 200, headers: { "Set-Cookie": "taxi_session=upstream-clear" } }); }, false); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true }); assert.equal(upstreamCookie, "taxi_session=raw-token"); assertOnlyAuthCookieCleared(response); });
test("upstream 401 logout preserves 401 body while still clearing taxi_session", async () => { const response = await forwardAuthToUpstream(logoutRequest("taxi_session=expired; unrelated=keep"), "/api/auth/logout", "http://api.test", [], async () => Response.json({ statusCode: 401, error: "Unauthorized" }, { status: 401 }), false); assert.equal(response.status, 401); assert.deepEqual(await response.json(), { statusCode: 401, error: "Unauthorized" }); assertOnlyAuthCookieCleared(response); });
test("logout never forwards or clears unrelated cookies", async () => { let upstreamCookie = ""; const response = await forwardAuthToUpstream(logoutRequest("unrelated=keep"), "/api/auth/logout", "http://api.test", [], async (_input, init) => { upstreamCookie = new Headers(init?.headers).get("cookie") ?? ""; return Response.json({ statusCode: 401, error: "Unauthorized" }, { status: 401 }); }, false); assert.equal(upstreamCookie, ""); assertOnlyAuthCookieCleared(response); });

test("native login POST is normalized to the existing JSON BFF flow without credential query parameters", async () => {
  const request = new Request("http://app.test/api/auth/login", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ login: "operator", password: "private-password" }) });
  let upstreamUrl = ""; let upstreamInit: RequestInit | undefined;
  const response = await forwardAuthToUpstream(request, "/api/auth/login", "http://api.test", ["login", "password"], async (input, init) => { upstreamUrl = String(input); upstreamInit = init; return Response.json({ ok: true }); }, false);
  assert.equal(response.status, 200);
  assert.equal(upstreamUrl, "http://api.test/api/auth/login");
  assert.equal(new URL(upstreamUrl).search, "");
  assert.equal(upstreamInit?.method, "POST");
  assert.equal(new Headers(upstreamInit?.headers).get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(String(upstreamInit?.body)), { login: "operator", password: "private-password" });
});
