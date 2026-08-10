import assert from "node:assert/strict";
import test from "node:test";
import { VEHICLE_DETAILS_FIXTURE } from "./vehicle-details-fixture";
import { VehicleDetailsContractError, parseVehicleDetailsResponse } from "./vehicle-details-contract";
import { VehicleDetailsBackendBadRequestError, VehicleDetailsBackendNotFoundError, VehicleDetailsBackendUnavailableError } from "./vehicle-details-errors";
import { createVehicleDetailsRouteHandler } from "./vehicle-details-route-handler";
const id = VEHICLE_DETAILS_FIXTURE.vehicle.id; const context = (vehicleId = id) => ({ params: Promise.resolve({ vehicleId }) });
test("BFF returns 200 and propagates validated vehicle id", async () => { let seen = ""; const details = parseVehicleDetailsResponse(VEHICLE_DETAILS_FIXTURE); const response = await createVehicleDetailsRouteHandler(async (value) => { seen = value; return details; })(new Request("http://web.test"), context()); assert.equal(response.status, 200); assert.equal(seen, id); });
test("BFF maps invalid id, backend 400/404, malformed and unavailable safely", async () => { const cases: readonly [string, unknown, number][] = [["bad", null, 400], [id, new VehicleDetailsBackendBadRequestError(), 400], [id, new VehicleDetailsBackendNotFoundError(), 404], [id, new VehicleDetailsContractError(), 502], [id, new VehicleDetailsBackendUnavailableError(), 503]]; for (const [vehicleId, error, expected] of cases) { const response = await createVehicleDetailsRouteHandler(async () => { throw error; })(new Request("http://web.test"), context(vehicleId as typeof id)); assert.equal(response.status, expected); assert.equal((await response.json()).error, expected === 400 ? "Bad Request" : expected === 404 ? "Not Found" : expected === 502 ? "Bad Gateway" : "Service Unavailable"); } });
