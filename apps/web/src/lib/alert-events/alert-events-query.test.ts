import assert from "node:assert/strict";
import test from "node:test";
import { ALERT_EVENTS_PAGE_SIZE, AlertEventsQueryError, parseAlertEventsFilters, parseAlertEventsRequestQuery, serializeAlertEventsFilters, serializeAlertEventsRequestQuery } from "./alert-events-query";

test("parses defaults, OPEN/RESOLVED, SPEEDING/INACTIVITY, and serializes only allowlisted values", () => {
  assert.deepEqual(parseAlertEventsRequestQuery(new URLSearchParams()), { status: undefined, type: undefined, limit: ALERT_EVENTS_PAGE_SIZE, cursor: undefined });
  assert.deepEqual(parseAlertEventsRequestQuery(new URLSearchParams("status=OPEN&type=SPEEDING&limit=25&cursor=opaque_cursor&ignored=x")), { status: "OPEN", type: "SPEEDING", limit: 25, cursor: "opaque_cursor" });
  assert.deepEqual(parseAlertEventsFilters(new URLSearchParams("status=RESOLVED&type=INACTIVITY")), { status: "RESOLVED", type: "INACTIVITY" });
  assert.equal(serializeAlertEventsFilters({ status: "OPEN", type: "INACTIVITY" }), "status=OPEN&type=INACTIVITY");
  assert.equal(serializeAlertEventsRequestQuery({ status: "RESOLVED", type: "SPEEDING", limit: 25, cursor: "opaque_cursor" }), "status=RESOLVED&type=SPEEDING&limit=25&cursor=opaque_cursor");
});

test("rejects invalid known alert-event query values", () => {
  for (const value of ["status=active", "type=other", "limit=0", "limit=101", "limit=1.5", "cursor=bad%2Fcursor"]) assert.throws(() => parseAlertEventsRequestQuery(new URLSearchParams(value)), AlertEventsQueryError);
});
