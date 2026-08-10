import assert from "node:assert/strict";
import test from "node:test";
import { CityGeofenceContractError } from "../../../../lib/city-geofence/city-geofence-contract";
import { CityGeofenceBackendUnavailableError } from "../../../../lib/city-geofence/city-geofence-errors";
import { createCityGeofenceRouteHandler } from "../../../../lib/city-geofence/city-geofence-route-handler";

const valid = { generatedAt: "2026-08-10T12:00:00.000Z", configured: false, geometry: null };

test("city geofence BFF maps valid, malformed, and unavailable upstream safely", async () => {
  const success = await createCityGeofenceRouteHandler(async () => valid)();
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), valid);
  assert.equal((await createCityGeofenceRouteHandler(async () => { throw new CityGeofenceContractError(); })()).status, 502);
  const unavailable = await createCityGeofenceRouteHandler(async () => { throw new CityGeofenceBackendUnavailableError(); })();
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.text()).includes("http"), false);
});
