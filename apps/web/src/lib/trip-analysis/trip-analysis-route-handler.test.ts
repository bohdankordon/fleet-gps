import assert from "node:assert/strict";
import test from "node:test";
import { TripAnalysisContractError } from "./trip-analysis-contract";
import { TripAnalysisBackendBadRequestError, TripAnalysisBackendNotFoundError, TripAnalysisBackendUnavailableError } from "./trip-analysis-errors";
import { tripAnalysisFixture, TRIP_ANALYSIS_VEHICLE_ID } from "./trip-analysis-fixture";
import { createTripAnalysisRouteHandler } from "./trip-analysis-route-handler";
const context = (vehicleId = TRIP_ANALYSIS_VEHICLE_ID) => ({ params: Promise.resolve({ vehicleId }) });
const url = `http://web.test/api/vehicles/${TRIP_ANALYSIS_VEHICLE_ID}/trip-analysis?from=2026-08-01T02%3A00%3A00%2B02%3A00&to=2026-08-08T00%3A00%3A00Z`;
test("BFF forwards normalized vehicle/from/to and returns uncached successful contract", async () => { let seen: unknown; const response = await createTripAnalysisRouteHandler(async (vehicleId, range) => { seen = { vehicleId, range }; return tripAnalysisFixture(); })(new Request(url), context()); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store"); assert.deepEqual(seen, { vehicleId: TRIP_ANALYSIS_VEHICLE_ID, range: { from: "2026-08-01T00:00:00.000Z", to: "2026-08-08T00:00:00.000Z" } }); });
test("BFF rejects malformed/extra input and preserves safe 400/404/502/503 behavior", async () => { const handler = createTripAnalysisRouteHandler(async () => tripAnalysisFixture()); assert.equal((await handler(new Request("http://web.test/api?from=x&to=y"), context("bad"))).status, 400); assert.equal((await handler(new Request(`${url}&provider=forbidden`), context())).status, 400); for (const [error, status] of [[new TripAnalysisBackendBadRequestError(), 400], [new TripAnalysisBackendNotFoundError(), 404], [new TripAnalysisContractError(), 502], [new TripAnalysisBackendUnavailableError(), 503], [new Error("secret"), 503]] as const) assert.equal((await createTripAnalysisRouteHandler(async () => { throw error; })(new Request(url), context())).status, status); });

