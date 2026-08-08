import assert from "node:assert/strict";
import test from "node:test";
import { AlertEventsContractError } from "../../../lib/alert-events/alert-events-contract";
import { AlertEventsBackendBadRequestError, AlertEventsBackendUnavailableError } from "../../../lib/alert-events/alert-events-errors";
import { alertEventsListFixture } from "../../../lib/alert-events/alert-events-fixture";
import { createAlertEventsRouteHandler } from "../../../lib/alert-events/alert-events-route-handler";

test("alert-events BFF returns 200 and propagates validated filters, page size, and cursor", async () => {
  let query: unknown; const handler = createAlertEventsRouteHandler(async (value) => { query = value; return alertEventsListFixture; });
  const response = await handler(new Request("http://localhost/api/alert-events?status=OPEN&type=SPEEDING&limit=25&cursor=opaque_cursor&ignored=x"));
  assert.equal(response.status, 200); assert.deepEqual(query, { status: "OPEN", type: "SPEEDING", limit: 25, cursor: "opaque_cursor" });
});
test("alert-events BFF returns safe 400, 502, and 503 responses", async () => {
  const invalid = await createAlertEventsRouteHandler(async () => alertEventsListFixture)(new Request("http://localhost/?status=bad")); assert.deepEqual(await invalid.json(), { statusCode: 400, error: "Bad Request" });
  const backendBadRequest = await createAlertEventsRouteHandler(async () => { throw new AlertEventsBackendBadRequestError(); })(new Request("http://localhost/")); assert.equal(backendBadRequest.status, 400);
  const malformed = await createAlertEventsRouteHandler(async () => { throw new AlertEventsContractError(); })(new Request("http://localhost/")); assert.equal(malformed.status, 502);
  const unavailable = await createAlertEventsRouteHandler(async () => { throw new AlertEventsBackendUnavailableError(); })(new Request("http://localhost/")); assert.equal(unavailable.status, 503); assert.equal((await unavailable.text()).includes("http"), false);
});
