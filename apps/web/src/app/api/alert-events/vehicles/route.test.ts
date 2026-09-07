import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AlertEventsContractError, parseAlertEventsVehicleOptions } from "../../../../lib/alert-events/alert-events-contract";
import { createAlertEventsVehicleOptionsRouteHandler } from "../../../../lib/alert-events/alert-events-route-handler";
const options = [{ vehicleId: "00000000-0000-4000-8000-000000000002", vehicleName: "DEMO" }];
test("vehicle options BFF validates public identity only and maps upstream failure safely", async () => {
  assert.deepEqual(parseAlertEventsVehicleOptions(options), options);
  for (const extra of [{ providerId: "secret" }, { latitude: 1 }, { telegram: "secret" }]) assert.throws(() => parseAlertEventsVehicleOptions([{ ...options[0], ...extra }]), AlertEventsContractError);
  assert.deepEqual(await (await createAlertEventsVehicleOptionsRouteHandler(async () => options)()).json(), options);
  assert.equal((await createAlertEventsVehicleOptionsRouteHandler(async () => { throw new AlertEventsContractError(); })()).status, 502);
  const failed = await createAlertEventsVehicleOptionsRouteHandler(async () => { throw new Error("private"); })(); assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /private/);
});
test("new BFF route uses existing cookie authentication and events.view proxy guard", () => {
  const proxy = readFileSync("src/proxy.ts", "utf8");
  assert.match(proxy, /path === "\/api\/alert-events\/vehicles"\) return \["events.view"\]/);
  assert.match(proxy, /statusCode: 401/); assert.match(proxy, /statusCode: 403/);
  const client = readFileSync("src/lib/alert-events/alert-events-client.ts", "utf8");
  assert.match(client, /fetchAlertEventsVehicleOptions\(fetcher: typeof fetch = authenticatedApiFetch\)/);
});
