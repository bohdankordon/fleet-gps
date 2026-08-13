import assert from "node:assert/strict";
import test from "node:test";
import { AuditQueryError, normalizeAuditFilters, parseAuditRequestQuery, serializeAuditRequestQuery } from "./audit-query";

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
