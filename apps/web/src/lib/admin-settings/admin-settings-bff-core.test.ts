import assert from "node:assert/strict";
import test from "node:test";
import { forwardAdminSettingsToUpstream } from "./admin-settings-bff-core";

function request(init: RequestInit = {}): Request { const headers = new Headers(init.headers); headers.set("Sec-Fetch-Site", "same-origin"); headers.set("Cookie", "other=drop; taxi_session=admin-token"); return new Request("http://app.test/api/admin/settings", { ...init, headers }); }

test("settings BFF forwards an approved revisioned PATCH once, preserving the upstream conflict", async () => {
  let calls = 0; let body = ""; let cookie = "";
  const response = await forwardAdminSettingsToUpstream(request({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: 7, citySpeedLimitKph: 55, speedRuleEnabled: false }) }), "http://api.test", async (_url, init) => { calls += 1; body = String(init?.body); cookie = new Headers(init?.headers).get("cookie") ?? ""; return Response.json({ statusCode: 409, error: "Conflict" }, { status: 409 }); });
  assert.equal(calls, 1); assert.equal(cookie, "taxi_session=admin-token"); assert.deepEqual(JSON.parse(body), { revision: 7, citySpeedLimitKph: 55, speedRuleEnabled: false }); assert.equal(response.status, 409); assert.equal(response.headers.get("cache-control"), "no-store");
});

test("settings BFF blocks cross-site and hidden-field mutations before an upstream call", async () => {
  let calls = 0; const fetcher: typeof fetch = async () => { calls += 1; return Response.json({ ok: true }); };
  const crossSite = new Request("http://app.test/api/admin/settings", { method: "PATCH", headers: { "Sec-Fetch-Site": "cross-site", "Content-Type": "application/json" }, body: "{}" });
  assert.equal((await forwardAdminSettingsToUpstream(crossSite, "http://api.test", fetcher)).status, 403);
  assert.equal((await forwardAdminSettingsToUpstream(request({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: 7, telegramChatId: "secret" }) }), "http://api.test", fetcher)).status, 400);
  assert.equal(calls, 0);
});
