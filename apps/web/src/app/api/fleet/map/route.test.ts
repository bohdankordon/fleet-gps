import assert from "node:assert/strict";
import test from "node:test";
import { FleetMapContractError } from "../../../../lib/fleet-map/fleet-map-contract";
import { FleetMapBackendUnavailableError } from "../../../../lib/fleet-map/fleet-map-errors";
import { createFleetMapRouteHandler } from "../../../../lib/fleet-map/fleet-map-route-handler";
const valid = { generatedAt: "2026-08-10T12:01:00.000Z", positionFreshnessSeconds: 300, summary: { totalVehicles: 0, withPosition: 0, withoutPosition: 0, invalidPosition: 0, fresh: 0, stale: 0 }, vehicles: [] };
test("fleet map BFF returns only validated data and maps malformed/unavailable upstream safely", async () => { assert.equal((await createFleetMapRouteHandler(async () => valid)()).status, 200); assert.equal((await createFleetMapRouteHandler(async () => { throw new FleetMapContractError(); })()).status, 502); const response = await createFleetMapRouteHandler(async () => { throw new FleetMapBackendUnavailableError(); })(); assert.equal(response.status, 503); assert.equal((await response.text()).includes("http"), false); });
