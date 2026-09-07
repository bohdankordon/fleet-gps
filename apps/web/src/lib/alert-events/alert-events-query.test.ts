import assert from "node:assert/strict";
import test from "node:test";
import { alertEventsPreset, switchAlertEventsMode, ALERT_EVENTS_PAGE_SIZE, AlertEventsQueryError, parseAlertEventsFilters, parseAlertEventsRequestQuery, serializeAlertEventsFilters, serializeAlertEventsRequestQuery } from "./alert-events-query";

test("parses defaults, OPEN/RESOLVED, SPEEDING/INACTIVITY, and serializes only allowlisted values", () => {
  assert.deepEqual(parseAlertEventsRequestQuery(new URLSearchParams()), { status: undefined, type: undefined, limit: ALERT_EVENTS_PAGE_SIZE, cursor: undefined });
  assert.deepEqual(parseAlertEventsRequestQuery(new URLSearchParams("status=OPEN&type=SPEEDING&limit=25&cursor=opaque_cursor&ignored=x")), { status: "OPEN", type: "SPEEDING", limit: 25, cursor: "opaque_cursor" });
  assert.equal(parseAlertEventsFilters(new URLSearchParams("status=RESOLVED&type=INACTIVITY")).mode, "history");
  assert.equal(serializeAlertEventsFilters({ status: "OPEN", type: "INACTIVITY" }), "mode=active&type=INACTIVITY");
  assert.equal(serializeAlertEventsRequestQuery({ status: "RESOLVED", type: "SPEEDING", limit: 25, cursor: "opaque_cursor" }), "status=RESOLVED&type=SPEEDING&limit=25&cursor=opaque_cursor");
});

test("rejects invalid known alert-event query values", () => {
  for (const value of ["status=active", "type=other", "limit=0", "limit=101", "limit=1.5", "cursor=bad%2Fcursor"]) assert.throws(() => parseAlertEventsRequestQuery(new URLSearchParams(value)), AlertEventsQueryError);
});

const now = new Date("2026-09-07T12:00:00Z");
const vehicleId = "00000000-0000-4000-8000-000000000002";
test("default Active and old OPEN links discover all OPEN episodes without age restriction", () => {
  for (const query of ["", "status=OPEN", "mode=active&from=bad&to=old"]) {
    const filters = parseAlertEventsFilters(new URLSearchParams(query), now);
    assert.equal(filters.mode, "active"); assert.equal(filters.status, "OPEN"); assert.equal(filters.from, undefined); assert.equal(filters.to, undefined);
    assert.equal(serializeAlertEventsRequestQuery({ ...filters, limit: 25 }), "status=OPEN&limit=25");
  }
});
test("History and old RESOLVED links default to seven days of opening time", () => {
  for (const query of ["mode=history", "status=RESOLVED"]) {
    const filters = parseAlertEventsFilters(new URLSearchParams(query), now);
    assert.equal(filters.status, "RESOLVED"); assert.equal(filters.period, "7d"); assert.equal(filters.from, "2026-08-31T12:00:00.000Z"); assert.equal(filters.to, now.toISOString());
  }
});
test("type, vehicle and all period choices survive URL serialization and Back/Forward restoration", () => {
  for (const period of ["24h", "7d", "30d"] as const) {
    const filters = { mode: "history" as const, status: "RESOLVED" as const, type: "INACTIVITY" as const, vehicleId, ...alertEventsPreset(period, now) };
    assert.deepEqual(parseAlertEventsFilters(new URLSearchParams(serializeAlertEventsFilters(filters)), new Date("2027-01-01")), filters);
  }
  const custom = parseAlertEventsFilters(new URLSearchParams("mode=history&period=custom&from=2020-01-01T00:00:00Z&to=2026-01-01T00:00:00Z")); assert.equal(custom.period, "custom");
});
test("mode switching retains type and vehicle but drops period in Active", () => {
  const active = switchAlertEventsMode({ ...alertEventsPreset("30d", now), type: "SPEEDING", vehicleId }, "active", now);
  assert.deepEqual(active, { mode: "active", status: "OPEN", type: "SPEEDING", vehicleId });
  assert.equal(switchAlertEventsMode(active, "history", now).period, "7d");
});
test("BFF accepts one-sided ranges and rejects unsafe UUIDs, repeats and malformed ranges", () => {
  for (const bound of ["from", "to"]) assert.equal(parseAlertEventsRequestQuery(new URLSearchParams(`${bound}=2026-08-01T00:00:00Z`))[bound as "from" | "to"], "2026-08-01T00:00:00.000Z");
  for (const query of ["vehicleId=provider-42", "from=2026-02-30T00:00:00Z", "to=bad", "from=2026-08-01T00:00:00Z&to=2026-08-01T00:00:00Z", "status=OPEN&status=RESOLVED"]) assert.throws(() => parseAlertEventsRequestQuery(new URLSearchParams(query)), AlertEventsQueryError);
  for (const query of ["mode=other", "mode=history&period=custom", "mode=history&period=30years"]) assert.throws(() => parseAlertEventsFilters(new URLSearchParams(query)), AlertEventsQueryError);
});
