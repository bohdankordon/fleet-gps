import assert from "node:assert/strict";
import test from "node:test";
import { AuditQueryError, hasAuditFilters, normalizeAuditFilters, normalizeAuditLocalFilters, parseAuditPageQuery, parseAuditRequestQuery, serializeAuditPageQuery, serializeAuditRequestQuery } from "./audit-query";

test("accepts and serializes only approved filters plus cursor", () => {
  const params = new URLSearchParams({ eventType: "USER_DISABLED", actorType: "USER", targetType: "USER", from: "2026-08-11T05:00:00+03:00", to: "2026-08-12T02:00:00.000Z", cursor: "opaque_cursor" });
  const parsed = parseAuditRequestQuery(params);
  assert.deepEqual(parsed, { eventType: "USER_DISABLED", actorType: "USER", targetType: "USER", from: "2026-08-11T02:00:00.000Z", to: "2026-08-12T02:00:00.000Z", cursor: "opaque_cursor" });
  assert.equal(serializeAuditRequestQuery(parsed).includes("limit"), false);
});

test("rejects unknown, repeated, invalid enum/date/cursor, and reversed input", () => {
  for (const query of ["limit=50", "offset=1", "sort=createdAt", "search=x", "eventType=OTHER", "actorType=ADMIN", "targetType=VEHICLE", "from=2026-08-11", "to=invalid", "from=2026-08-12T00%3A00%3A00Z&to=2026-08-11T00%3A00%3A00Z", "cursor=***", "eventType=USER_DISABLED&eventType=USER_ENABLED"]) {
    assert.throws(() => parseAuditRequestQuery(new URLSearchParams(query)), AuditQueryError, query);
  }
});

test("normalizes UI absolute timestamps and rejects unsafe drafts", () => {
  assert.deepEqual(normalizeAuditFilters({ eventType: "", actorType: "SYSTEM", targetType: "", from: "2026-08-11T05:00:00+03:00", to: "" }), { actorType: "SYSTEM", from: "2026-08-11T02:00:00.000Z" });
  assert.throws(() => normalizeAuditFilters({ eventType: "", actorType: "", targetType: "", from: "2026-08-11", to: "" }), AuditQueryError);
});

test("converts Europe/Kyiv audit controls to exact UTC query instants", () => {
  assert.deepEqual(normalizeAuditLocalFilters({ eventType: "", actorType: "USER", targetType: "", from: "2026-01-10T08:30", to: "2026-08-10T08:30" }), {
    actorType: "USER",
    from: "2026-01-10T06:30:00.000Z",
    to: "2026-08-10T05:30:00.000Z",
  });
  assert.deepEqual(normalizeAuditLocalFilters({ eventType: "", actorType: "", targetType: "", from: "", to: "" }), {});
});

test("audit controls reject invalid, nonexistent, ambiguous, and reversed Kyiv civil ranges", () => {
  for (const filters of [
    { from: "2026-02-30T12:00", to: "" },
    { from: "2026-03-29T03:30", to: "" },
    { from: "2026-10-25T03:30", to: "" },
    { from: "2026-08-11T09:00", to: "2026-08-11T08:00" },
  ]) assert.throws(() => normalizeAuditLocalFilters({ eventType: "", actorType: "", targetType: "", ...filters }), AuditQueryError);
});

test("open-ended Kyiv ranges preserve their missing bound through canonical URL round trips", () => {
  for (const bound of ["from", "to"] as const) {
    const filters = normalizeAuditLocalFilters({ eventType: "", actorType: "SYSTEM", targetType: "", from: "", to: "", [bound]: "2026-08-10T08:30" });
    assert.deepEqual(filters, { actorType: "SYSTEM", [bound]: "2026-08-10T05:30:00.000Z" });
    assert.deepEqual(parseAuditPageQuery(new URLSearchParams(serializeAuditPageQuery(filters))), { valid: true, filters });
  }
});

test("page URL accepts only canonical applied filters and never a cursor", () => {
  const parsed = parseAuditPageQuery(new URLSearchParams("eventType=USER_DISABLED&from=2026-08-11T02%3A00%3A00.000Z"));
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.filters, { eventType: "USER_DISABLED", from: "2026-08-11T02:00:00.000Z" });
  assert.equal(serializeAuditPageQuery(parsed.filters), "eventType=USER_DISABLED&from=2026-08-11T02%3A00%3A00.000Z");
  assert.equal(hasAuditFilters(parsed.filters), true);
  for (const query of ["cursor=opaque", "search=x", "eventType=OTHER", "eventType=USER_DISABLED&eventType=USER_ENABLED"]) assert.deepEqual(parseAuditPageQuery(new URLSearchParams(query)), { filters: {}, valid: false }, query);
});
