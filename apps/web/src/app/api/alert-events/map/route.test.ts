import assert from "node:assert/strict";
import test from "node:test";
import { OpenAlertMapContractError } from "../../../../lib/open-alert-map/open-alert-map-contract";
import { OpenAlertMapBackendUnavailableError } from "../../../../lib/open-alert-map/open-alert-map-errors";
import { createOpenAlertMapRouteHandler } from "../../../../lib/open-alert-map/open-alert-map-route-handler";

const valid = { generatedAt: "2026-08-10T12:00:00.000Z", summary: { totalOpenAlerts: 0, vehiclesWithOpenAlerts: 0, speeding: 0, inactivity: 0 }, vehicles: [] };

test("OPEN alert map BFF returns valid 200 and safe 502/503", async () => {
  const success = await createOpenAlertMapRouteHandler(async () => valid)();
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), valid);
  assert.equal((await createOpenAlertMapRouteHandler(async () => { throw new OpenAlertMapContractError(); })()).status, 502);
  const unavailable = await createOpenAlertMapRouteHandler(async () => { throw new OpenAlertMapBackendUnavailableError(); })();
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.text()).includes("http"), false);
});
