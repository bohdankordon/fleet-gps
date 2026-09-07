"use strict";
// Read-only localhost integration companion to docs/events-workspace-verification.md.
// No provider clients, DB connections, fixture writes, or remote hosts.
const assert = require("node:assert/strict");
function localBase(value, fallback) {
  const url = new URL(value || fallback);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/") throw new Error("Smoke requires a loopback HTTP origin");
  return url.origin;
}
async function main() {
  const api = localBase(process.env.EVENTS_SMOKE_API_URL, "http://127.0.0.1:3000");
  const web = localBase(process.env.EVENTS_SMOKE_WEB_URL, "http://127.0.0.1:3001");
  const login = process.env.EVENTS_SMOKE_LOGIN; const password = process.env.EVENTS_SMOKE_PASSWORD;
  if (!login || !password) throw new Error("Set EVENTS_SMOKE_LOGIN and EVENTS_SMOKE_PASSWORD for the local demo account");
  const loginResponse = await fetch(`${api}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ login, password }), redirect: "error" });
  assert.ok(loginResponse.ok, "local login");
  const cookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0]; assert.ok(cookie);
  const get = (base, path, authenticated = true) => fetch(`${base}${path}`, { headers: authenticated ? { Cookie: cookie } : {}, redirect: "error" });
  const json = async (base, path) => { const response = await get(base, path); assert.equal(response.status, 200, path); return response.json(); };
  const checks = [];
  for (const base of [api, web]) {
    assert.equal((await get(base, "/api/alert-events/vehicles", false)).status, 401); checks.push("unauthenticated vehicle options denied");
    const options = await json(base, "/api/alert-events/vehicles");
    for (const option of options) assert.deepEqual(Object.keys(option).sort(), ["vehicleId", "vehicleName"]);
    const demo = options.find((v) => v.vehicleName === "DEMO FULL"); assert.ok(demo, "existing local DEMO FULL fixture required");
    const query = `vehicleId=${demo.vehicleId}`;
    const active = await json(base, `/api/alert-events?status=OPEN&${query}&limit=25`);
    assert.ok(active.items.length >= 2); assert.ok(active.items.every((e) => e.status === "OPEN" && Number.isFinite(Date.parse(e.lastObservedAt)))); checks.push("active and stored lastObservedAt");
    const summary = await json(base, "/api/alert-events/summary"); assert.equal(summary.open.total, summary.open.speeding + summary.open.inactivity);
    const first = await json(base, `/api/alert-events?${query}&limit=1`); assert.ok(first.nextCursor);
    const second = await json(base, `/api/alert-events?${query}&limit=1&cursor=${first.nextCursor}`); assert.notEqual(first.items[0].id, second.items[0].id); checks.push("strict cursor pagination");
    const anchor = first.items[0];
    const inclusive = await json(base, `/api/alert-events?${query}&from=${encodeURIComponent(anchor.openedAt)}&limit=100`); assert.ok(inclusive.items.some((e) => e.id === anchor.id));
    const exclusive = await json(base, `/api/alert-events?${query}&to=${encodeURIComponent(anchor.openedAt)}&limit=100`); assert.ok(exclusive.items.every((e) => Date.parse(e.openedAt) < Date.parse(anchor.openedAt))); checks.push("from inclusive and to exclusive on opening");
    const history = await json(base, `/api/alert-events?${query}&status=RESOLVED&type=INACTIVITY&from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z`); assert.ok(history.items.length); assert.ok(history.items.every((e) => e.status === "RESOLVED" && e.type === "INACTIVITY" && e.vehicle.id === demo.vehicleId)); checks.push("status type vehicle range composition");
    assert.deepEqual(await json(base, "/api/alert-events/summary"), summary); checks.push("summary independent of filters");
    for (const bad of ["vehicleId=provider-private", "from=bad", "to=2026-02-30T00:00:00Z", "from=2026-09-01T00:00:00Z&to=2026-09-01T00:00:00Z"]) assert.equal((await get(base, `/api/alert-events?${bad}`)).status, 400); checks.push("malformed queries return 400");
  }
  const options = await json(web, "/api/alert-events/vehicles"); const vehicleId = options.find((v) => v.vehicleName === "DEMO FULL").vehicleId;
  const checksByRoute = [
    ["/events", "events-workspace"], ["/", "fleet"], ["/map", "fleet-map"],
    [`/vehicles/${vehicleId}`, "vehicle-detail"], [`/vehicles/${vehicleId}/trips`, "vehicle-trips"], [`/vehicles/${vehicleId}/track`, "vehicle-track"],
  ];
  for (const [path, marker] of checksByRoute) { const response = await get(web, path); assert.equal(response.status, 200, path); const html = await response.text(); assert.ok(html.includes(marker), path); checks.push(`SSR ${path}`); }
  console.log(JSON.stringify({ passed: checks.length, checks, providerCalls: 0, telegramCalls: 0, domainWrites: 0, note: "Login creates a local auth session; this smoke performs no domain mutations. Browser checklist is separate." }, null, 2));
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { localBase };
