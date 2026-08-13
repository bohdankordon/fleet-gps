import assert from "node:assert/strict";
import test from "node:test";
import { forwardAdminUsersToUpstream } from "./admin-users-bff-core";

function request(path = "/api/admin/users", init: RequestInit = {}): Request { const headers = new Headers(init.headers); headers.set("Sec-Fetch-Site", "same-origin"); headers.set("Cookie", "preference=dark; taxi_session=secret-token; analytics=yes"); return new Request(`http://app.test${path}`, { ...init, headers }); }

test("admin BFF forwards only taxi_session and relays one-time secrets with no-store", async () => {
  let cookie = "";
  const response = await forwardAdminUsersToUpstream(request(undefined, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: "user", role: "USER", permissions: [] }) }), "/api/admin/users", "http://api.test", ["login", "role", "permissions"], async (_url, init) => { cookie = new Headers(init?.headers).get("cookie") ?? ""; return Response.json({ user: { id: "id" }, temporaryPassword: "one-time-secret" }); });
  assert.equal(cookie, "taxi_session=secret-token");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json() as { temporaryPassword: string }).temporaryPassword, "one-time-secret");
});

test("cross-origin and secret-bearing client payloads execute zero upstream mutations", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls += 1; return Response.json({ ok: true }); };
  const crossOrigin = new Request("http://app.test/api/admin/users", { method: "POST", headers: { Origin: "https://evil.test", "Sec-Fetch-Site": "cross-site" } });
  assert.equal((await forwardAdminUsersToUpstream(crossOrigin, "/api/admin/users", "http://api.test", ["login", "role", "permissions"], fetcher)).status, 403);
  const passwordPayload = request(undefined, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: "user", role: "USER", permissions: [], password: "forbidden" }) });
  assert.equal((await forwardAdminUsersToUpstream(passwordPayload, "/api/admin/users", "http://api.test", ["login", "role", "permissions"], fetcher)).status, 400);
  const resetPayload = request("/api/admin/users/id/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "forbidden" }) });
  assert.equal((await forwardAdminUsersToUpstream(resetPayload, "/api/admin/users/id/reset-password", "http://api.test", [], fetcher)).status, 400);
  assert.equal(calls, 0);
});

test("cross-site admin create and password reset both execute zero upstream mutations", async () => { let calls = 0; const fetcher: typeof fetch = async () => { calls += 1; return Response.json({ ok: true }); }; for (const [path, keys] of [["/api/admin/users", ["login", "role", "permissions"]], ["/api/admin/users/id/reset-password", []]] as const) { const request = new Request(`http://app.test${path}`, { method: "POST", headers: { Origin: "http://app.test", "Sec-Fetch-Site": "cross-site" } }); assert.equal((await forwardAdminUsersToUpstream(request, path, "http://api.test", keys, fetcher)).status, 403); } assert.equal(calls, 0); });

test("admin BFF preserves authorization status and masks upstream internals", async () => {
  for (const status of [401, 403]) { const response = await forwardAdminUsersToUpstream(new Request("http://app.test/api/admin/users"), "/api/admin/users", "http://api.test", null, async () => Response.json({ statusCode: status, error: status === 401 ? "Unauthorized" : "Forbidden" }, { status })); assert.equal(response.status, status); }
  const failure = await forwardAdminUsersToUpstream(new Request("http://app.test/api/admin/users"), "/api/admin/users", "http://api.test", null, async () => Response.json({ stack: "private SQL stack" }, { status: 500 }));
  assert.equal(JSON.stringify(await failure.json()).includes("private"), false);
});

test("same-origin access, disable, enable, and reset writes reach only their expected upstream route", async () => { const cases = [["PATCH", "/api/admin/users/id/access", ["role", "permissions"], { role: "USER", permissions: [] }], ["POST", "/api/admin/users/id/disable", [], {}], ["POST", "/api/admin/users/id/enable", [], {}], ["POST", "/api/admin/users/id/reset-password", [], {}]] as const; for (const [method, path, keys, body] of cases) { let called = ""; const response = await forwardAdminUsersToUpstream(request(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), path, "http://api.test", keys, async (url) => { called = String(url); return Response.json({ ok: true }); }); assert.equal(response.status, 200); assert.equal(called, `http://api.test${path}`); } });
