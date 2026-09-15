import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { forwardVehicleGroupsToUpstream } from "./vehicle-groups-bff-core";

function request(path = "/api/admin/vehicle-groups", init: RequestInit = {}): Request { const headers = new Headers(init.headers); headers.set("Sec-Fetch-Site", "same-origin"); headers.set("Cookie", "preference=dark; taxi_session=secret-token; analytics=yes"); return new Request(`http://app.test${path}`, { ...init, headers }); }

test("groups BFF forwards only taxi_session and relays group payloads with no-store", async () => {
  let cookie = "";
  let body = "";
  const response = await forwardVehicleGroupsToUpstream(request(undefined, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Taxi" }) }), "/api/admin/vehicle-groups", "http://api.test", ["name"], async (_url, init) => { cookie = new Headers(init?.headers).get("cookie") ?? ""; body = String(init?.body ?? ""); return Response.json({ id: "id" }); });
  assert.equal(cookie, "taxi_session=secret-token");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(JSON.parse(body), { name: "Taxi" });
});

test("groups BFF rejects unknown membership keys and cross-site writes before upstream", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls += 1; return Response.json({ ok: true }); };
  const badMembership = request(undefined, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicleIds: [], extra: 1 }) });
  assert.equal((await forwardVehicleGroupsToUpstream(badMembership, "/api/admin/vehicle-groups/id/vehicles", "http://api.test", ["vehicleIds"], fetcher)).status, 400);
  const crossOrigin = new Request("http://app.test/api/admin/vehicle-groups", { method: "POST", headers: { Origin: "https://evil.test", "Sec-Fetch-Site": "cross-site" } });
  assert.equal((await forwardVehicleGroupsToUpstream(crossOrigin, "/api/admin/vehicle-groups", "http://api.test", ["name"], fetcher)).status, 403);
  assert.equal(calls, 0);
});

test("admin routes forward the settled Stage A contracts", () => {
  const usersRoute = readFileSync("src/app/api/admin/users/route.ts", "utf8");
  assert.ok(usersRoute.includes(`"vehicleAccess"`), "create forwards vehicleAccess");
  const accessRoute = readFileSync("src/app/api/admin/users/[userId]/access/route.ts", "utf8");
  assert.ok(accessRoute.includes(`"vehicleAccess"`), "access edit forwards vehicleAccess");
  const groupRoute = readFileSync("src/app/api/admin/vehicle-groups/[groupId]/vehicles/route.ts", "utf8");
  assert.ok(groupRoute.includes(`"vehicleIds"`), "membership forwards desired-state vehicleIds");
});
