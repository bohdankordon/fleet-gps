import assert from "node:assert/strict";
import test from "node:test";
import { AlertEventsContractError } from "../../../../lib/alert-events/alert-events-contract";
import { AlertEventsBackendUnavailableError } from "../../../../lib/alert-events/alert-events-errors";
import { alertEventsSummaryFixture } from "../../../../lib/alert-events/alert-events-fixture";
import { createAlertEventsSummaryRouteHandler } from "../../../../lib/alert-events/alert-events-route-handler";

test("alert-events summary BFF returns valid 200 response", async () => { const response = await createAlertEventsSummaryRouteHandler(async () => alertEventsSummaryFixture)(); assert.equal(response.status, 200); assert.deepEqual(await response.json(), alertEventsSummaryFixture); });
test("alert-events summary BFF maps malformed and unavailable upstreams safely", async () => { const malformed = await createAlertEventsSummaryRouteHandler(async () => { throw new AlertEventsContractError(); })(); assert.equal(malformed.status, 502); const unavailable = await createAlertEventsSummaryRouteHandler(async () => { throw new AlertEventsBackendUnavailableError(); })(); assert.equal(unavailable.status, 503); });
