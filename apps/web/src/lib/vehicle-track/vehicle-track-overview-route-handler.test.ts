import assert from "node:assert/strict";
import test from "node:test";
import { VehicleTrackBackendBadRequestError, VehicleTrackBackendNotFoundError, VehicleTrackBackendTooDenseError, VehicleTrackBackendUnavailableError } from "./vehicle-track-errors";
import { overviewTrackFixture, TRACK_VEHICLE_ID } from "./vehicle-track-fixture";
import { VehicleTrackOverviewContractError, type VehicleTrackOverviewResponse } from "./vehicle-track-overview-contract";
import { createVehicleTrackOverviewRouteHandler } from "./vehicle-track-overview-route-handler";

const context = (vehicleId = TRACK_VEHICLE_ID) => ({ params: Promise.resolve({ vehicleId }) });
const url = `http://web.test/api/vehicles/${TRACK_VEHICLE_ID}/track/overview?from=2026-08-01T02%3A00%3A00%2B02%3A00&to=2026-08-04T00%3A00%3A00Z`;

test("overview BFF returns strict 200 and propagates only normalized range", async () => {
  let seen: unknown; const data = overviewTrackFixture();
  const response = await createVehicleTrackOverviewRouteHandler(async (id, range) => { seen = { id, range }; return data; })(new Request(url), context());
  assert.equal(response.status, 200);
  assert.deepEqual(seen, { id: TRACK_VEHICLE_ID, range: { from: "2026-08-01T00:00:00.000Z", to: "2026-08-04T00:00:00.000Z" } });
  assert.deepEqual(await response.json(), data);
});

test("overview BFF maps 400/404/422/502/503 without raw bodies", async () => {
  const errors: readonly [unknown, number][] = [
    [new VehicleTrackBackendBadRequestError(), 400],
    [new VehicleTrackBackendNotFoundError(), 404],
    [new VehicleTrackBackendTooDenseError(), 422],
    [new VehicleTrackOverviewContractError(), 502],
    [new VehicleTrackBackendUnavailableError(), 503],
    [new Error("raw database secret"), 503],
  ];
  for (const [error, status] of errors) {
    const response = await createVehicleTrackOverviewRouteHandler(async () => { throw error; })(new Request(url), context());
    const body = await response.text(); assert.equal(response.status, status); assert.equal(body.includes("secret"), false);
  }
  const invalid = await createVehicleTrackOverviewRouteHandler(async () => overviewTrackFixture() as VehicleTrackOverviewResponse)(new Request("http://web.test/api?from=x&to=y"), context("bad"));
  assert.equal(invalid.status, 400);
  const unknownQuery = await createVehicleTrackOverviewRouteHandler(async () => overviewTrackFixture())(new Request(`${url}&providerId=secret`), context());
  assert.equal(unknownQuery.status, 400);
  const tooLong = await createVehicleTrackOverviewRouteHandler(async () => overviewTrackFixture())(new Request(`http://web.test/api/vehicles/${TRACK_VEHICLE_ID}/track/overview?from=2026-08-01T00%3A00%3A00Z&to=2026-08-08T00%3A00%3A00.001Z`), context());
  assert.equal(tooLong.status, 400);
});
