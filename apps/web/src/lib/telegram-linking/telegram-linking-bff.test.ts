import assert from "node:assert/strict";
import test from "node:test";
import { forwardTelegramAccountToUpstream } from "./telegram-linking-bff-core";

function request(method: string, headers: Record<string, string> = {}): Request {
  return new Request("http://web.test/api/account/notifications", { method, headers: { cookie: "noise=x; taxi_session=session-token; other=y", ...headers } });
}

test("account linking BFF forwards only the session cookie to its fixed internal API path", async () => {
  let call: { url: string; init?: RequestInit } | undefined;
  try {
    const response = await forwardTelegramAccountToUpstream(request("GET", { authorization: "Bearer no", "x-extra": "no" }), "/api/account/notifications", "http://api.test", async (url, init) => { call = { url: String(url), init }; return Response.json({ status: "CONNECTED", pendingExpiresAt: null }); });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { status: "CONNECTED", pendingExpiresAt: null });
    assert.equal(call?.url, "http://api.test/api/account/notifications");
    const headers = new Headers(call?.init?.headers); assert.equal(headers.get("cookie"), "taxi_session=session-token"); assert.equal(headers.get("authorization"), null); assert.equal(headers.get("x-extra"), null);
    assert.equal((await forwardTelegramAccountToUpstream(request("POST", { origin: "https://evil.test", "sec-fetch-site": "cross-site" }), "/api/account/notifications/telegram/link", "http://api.test")).status, 403);
  } finally { /* no process state */ }
});

test("account preferences PATCH forwards only its JSON body and session cookie", async () => {
  const body = JSON.stringify({ expectedRevision: 4, enabled: true, speedingEnabled: false, inactivityEnabled: true, vehicleScope: "ALL", selectedVehicleIds: [] });
  const source = new Request("http://web.test/api/account/notifications/preferences", { method: "PATCH", headers: { cookie: "taxi_session=session-token", origin: "http://web.test", "content-type": "application/json", authorization: "Bearer no" }, body });
  let call: { url: string; init?: RequestInit } | undefined;
  const response = await forwardTelegramAccountToUpstream(source, "/api/account/notifications/preferences", "http://api.test", async (url, init) => { call = { url: String(url), init }; return Response.json({ revision: 5 }); });
  assert.equal(response.status, 200); assert.equal(call?.url, "http://api.test/api/account/notifications/preferences");
  const headers = new Headers(call?.init?.headers); assert.equal(headers.get("cookie"), "taxi_session=session-token"); assert.equal(headers.get("content-type"), "application/json"); assert.equal(headers.get("authorization"), null); assert.equal(call?.init?.body, body);
});

test("account linking BFF preserves authorization outcomes but masks internal failure bodies", async () => {
  try {
    assert.equal((await forwardTelegramAccountToUpstream(request("GET"), "/api/account/notifications", "http://api.test", async () => Response.json({ error: "Unauthorized" }, { status: 401 }))).status, 401);
    const failure = await forwardTelegramAccountToUpstream(request("GET"), "/api/account/notifications", "http://api.test", async () => Response.json({ stack: "private SQL error" }, { status: 500 }));
    assert.equal(failure.status, 500); assert.equal((await failure.text()).includes("private"), false);
  } finally { /* no process state */ }
});
