import assert from "node:assert/strict";
import test from "node:test";
import { VehicleTrackContractError, type VehicleTrackResponse } from "./vehicle-track-contract";
import { VehicleTrackBackendBadRequestError, VehicleTrackBackendNotFoundError, VehicleTrackBackendTooDenseError, VehicleTrackBackendUnavailableError } from "./vehicle-track-errors";
import { trackFixture, TRACK_VEHICLE_ID } from "./vehicle-track-fixture";
import { createVehicleTrackRouteHandler } from "./vehicle-track-route-handler";

const context = (vehicleId = TRACK_VEHICLE_ID) => ({ params: Promise.resolve({ vehicleId }) });
const url = `http://web.test/api/vehicles/${TRACK_VEHICLE_ID}/track?from=2026-08-10T12%3A00%3A00%2B02%3A00&to=2026-08-10T11%3A00%3A00Z`;
test("BFF returns valid 200 and propagates decoded normalized allowlisted range", async () => {
  let seen: unknown; const data = trackFixture();
  const response = await createVehicleTrackRouteHandler(async (id, range) => { seen = { id, range }; return data; })(new Request(url), context());
  assert.equal(response.status, 200); assert.deepEqual(seen, { id: TRACK_VEHICLE_ID, range: { from: "2026-08-10T10:00:00.000Z", to: "2026-08-10T11:00:00.000Z" } });
});
test("BFF maps 400/404/422/502/503 safely without leaking raw bodies", async () => {
  const errors: readonly [unknown, number][] = [[new VehicleTrackBackendBadRequestError(), 400], [new VehicleTrackBackendNotFoundError(), 404], [new VehicleTrackBackendTooDenseError(), 422], [new VehicleTrackContractError(), 502], [new VehicleTrackBackendUnavailableError(), 503], [new Error("raw database secret"), 503]];
  for (const [error, status] of errors) { const response = await createVehicleTrackRouteHandler(async () => { throw error; })(new Request(url), context()); const body = await response.text(); assert.equal(response.status, status); assert.equal(body.includes("secret"), false); }
  const invalid = await createVehicleTrackRouteHandler(async () => trackFixture() as VehicleTrackResponse)(new Request("http://web.test/api?from=x&to=y"), context("bad")); assert.equal(invalid.status, 400);
  const unknownQuery = await createVehicleTrackRouteHandler(async () => trackFixture())(new Request(`${url}&providerId=secret`), context()); assert.equal(unknownQuery.status, 400);
});
