import assert from "node:assert/strict";
import test from "node:test";
import { AlertEventsQueryParamsError, DEFAULT_ALERT_EVENTS_PAGE_SIZE, MAX_ALERT_EVENTS_PAGE_SIZE, encodeAlertEventsCursor, parseAlertEventsQueryParams } from "./alert-events-query-params";

const VEHICLE_ID = "00000000-0000-4000-8000-000000000001";
const EVENT_ID = "00000000-0000-4000-8000-000000000002";
const OPENED_AT = new Date("2026-08-08T10:00:00.000Z");

test("parses defaults and every supported alert-event filter", () => {
  assert.deepEqual(parseAlertEventsQueryParams({}), { status: undefined, type: undefined, vehicleId: undefined, limit: DEFAULT_ALERT_EVENTS_PAGE_SIZE, cursor: undefined });
  assert.deepEqual(parseAlertEventsQueryParams({ status: "OPEN", type: "SPEEDING", vehicleId: VEHICLE_ID, limit: "25", ignored: "safe" }), { status: "OPEN", type: "SPEEDING", vehicleId: VEHICLE_ID, limit: 25, cursor: undefined });
  assert.deepEqual(parseAlertEventsQueryParams({ status: "RESOLVED", type: "INACTIVITY" }), { status: "RESOLVED", type: "INACTIVITY", vehicleId: undefined, limit: DEFAULT_ALERT_EVENTS_PAGE_SIZE, cursor: undefined });
});

test("round-trips a deterministic opaque keyset cursor", () => {
  const encoded = encodeAlertEventsCursor({ openedAt: OPENED_AT, id: EVENT_ID });
  assert.deepEqual(parseAlertEventsQueryParams({ cursor: encoded }).cursor, { openedAt: OPENED_AT, id: EVENT_ID });
  assert.equal(encoded.includes("2026"), false);
});

test("accepts page-size bounds and rejects values outside them", () => {
  assert.equal(parseAlertEventsQueryParams({ limit: "1" }).limit, 1);
  assert.equal(parseAlertEventsQueryParams({ limit: String(MAX_ALERT_EVENTS_PAGE_SIZE) }).limit, MAX_ALERT_EVENTS_PAGE_SIZE);
  for (const limit of ["0", "101", "1.5", "-1", "01", "", 10, ["10"]]) {
    assert.throws(() => parseAlertEventsQueryParams({ limit }), AlertEventsQueryParamsError);
  }
});

test("rejects invalid enum, UUID, array, and cursor query values", () => {
  const badQueries: readonly Readonly<Record<string, unknown>>[] = [
    { status: "open" }, { status: "CLOSED" }, { type: "speeding" }, { type: "OTHER" },
    { vehicleId: "device-12" }, { vehicleId: [VEHICLE_ID] }, { status: ["OPEN"] },
    { cursor: "***" }, { cursor: Buffer.from("{}", "utf8").toString("base64url") },
    { cursor: Buffer.from(JSON.stringify({ openedAt: "2026-08-08", id: EVENT_ID }), "utf8").toString("base64url") },
    { cursor: Buffer.from(JSON.stringify({ openedAt: OPENED_AT.toISOString(), id: "not-a-uuid" }), "utf8").toString("base64url") },
  ];
  for (const query of badQueries) assert.throws(() => parseAlertEventsQueryParams(query), AlertEventsQueryParamsError);
});


test("opening ranges parse offset timestamps, one-sided bounds and no arbitrary retention limit", () => {
  const from = "2026-08-01T03:00:00+03:00"; const to = "2026-09-01T00:00:00Z";
  assert.equal(parseAlertEventsQueryParams({ from }).from?.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(parseAlertEventsQueryParams({ to }).to?.toISOString(), "2026-09-01T00:00:00.000Z");
  const range = parseAlertEventsQueryParams({ from, to }); assert.ok(range.from! < range.to!);
});
test("opening ranges reject malformed, calendar-invalid, ambiguous absolute and reversed values", () => {
  for (const value of ["bad", "2026-02-30T00:00:00Z", "2026-08-01T00:00:00", "2026-08-01T00:00:00+14:01", ["2026-08-01T00:00:00Z"]]) {
    assert.throws(() => parseAlertEventsQueryParams({ from: value }), AlertEventsQueryParamsError);
    assert.throws(() => parseAlertEventsQueryParams({ to: value }), AlertEventsQueryParamsError);
  }
  for (const to of ["2026-08-01T00:00:00Z", "2026-07-01T00:00:00Z"]) assert.throws(() => parseAlertEventsQueryParams({ from: "2026-08-01T00:00:00Z", to }), AlertEventsQueryParamsError);
});
