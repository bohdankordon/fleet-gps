import assert from "node:assert/strict";
import test from "node:test";
import { AuditQueryError, normalizeAuditFilters, normalizeAuditLocalFilters, parseAuditRequestQuery, serializeAuditRequestQuery } from "./audit-query";

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
