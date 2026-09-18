import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AlertEventsContractError, parseAlertEventsFilterOptions } from "../../../../lib/alert-events/alert-events-contract";
import { createAlertEventsFilterOptionsRouteHandler } from "../../../../lib/alert-events/alert-events-route-handler";
const options = { vehicles: [{ vehicleId: "00000000-0000-4000-8000-000000000002", vehicleName: "DEMO", group: null }], groups: [], hasUngrouped: true };
test("filter options BFF validates event vehicles and fleet group metadata strictly", async () => {
  assert.deepEqual(parseAlertEventsFilterOptions(options), options);
  for (const extra of [{ providerId: "secret" }, { latitude: 1 }, { telegram: "secret" }]) assert.throws(() => parseAlertEventsFilterOptions({ ...options, vehicles: [{ ...options.vehicles[0], ...extra }] }), AlertEventsContractError);
  assert.throws(() => parseAlertEventsFilterOptions({ ...options, secret: true }), AlertEventsContractError);
  assert.throws(() => parseAlertEventsFilterOptions({ ...options, groups: [{ id: "00000000-0000-4000-8000-000000000003", name: "A" }, { id: "00000000-0000-4000-8000-000000000003", name: "A" }] }), AlertEventsContractError);
  assert.deepEqual(await (await createAlertEventsFilterOptionsRouteHandler(async () => options)()).json(), options);
  assert.equal((await createAlertEventsFilterOptionsRouteHandler(async () => { throw new AlertEventsContractError(); })()).status, 502);
  const failed = await createAlertEventsFilterOptionsRouteHandler(async () => { throw new Error("private"); })(); assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /private/);
});
test("new BFF route uses existing cookie authentication and events.view proxy guard", () => {
  const proxy = readFileSync("src/proxy.ts", "utf8");
  assert.match(proxy, /path === "\/api\/alert-events\/vehicles" \|\| \/\^\\\/api\\\/alert-events/);
  assert.match(proxy, /\/investigation\$\/\.test\(path\)\) return \["events\.view"\]/);
  assert.match(proxy, /statusCode: 401/); assert.match(proxy, /statusCode: 403/);
  const client = readFileSync("src/lib/alert-events/alert-events-client.ts", "utf8");
  assert.match(client, /fetchAlertEventsFilterOptions\(fetcher: typeof fetch = authenticatedApiFetch\)/);
});
