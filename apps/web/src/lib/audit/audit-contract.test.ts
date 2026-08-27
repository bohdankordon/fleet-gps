import assert from "node:assert/strict";
import test from "node:test";
import { AUDIT_EVENT_TYPES, AuditContractError, parseAuditReadResponse } from "./audit-contract";
import { auditResponseFixture } from "./audit-fixture";

test("accepts safe typed details for all audit event types", () => {
  const parsed = parseAuditReadResponse(auditResponseFixture());
  assert.deepEqual(parsed.items.map((item) => item.eventType), AUDIT_EVENT_TYPES);
  assert.equal(parsed.items.every((item) => item.details.status === "AVAILABLE"), true);
});

test("accepts the per-row unavailable fallback and enforces page/cursor consistency", () => {
  const response = auditResponseFixture();
  assert.equal(parseAuditReadResponse({ items: [{ ...response.items[0], details: { status: "UNAVAILABLE" } }], nextCursor: "opaque_cursor", hasMore: true }).items[0]?.details.status, "UNAVAILABLE");
  assert.throws(() => parseAuditReadResponse({ ...response, hasMore: true }), AuditContractError);
  assert.throws(() => parseAuditReadResponse({ ...response, items: Array.from({ length: 51 }, () => response.items[0]) }), AuditContractError);
});

test("rejects raw/extra details, actor IDs, and arbitrary database fields", () => {
  const response = auditResponseFixture();
  const item = response.items[2]!;
  for (const mutation of [
    { ...item, actorUserId: "00000000-0000-4000-8000-000000000001" },
    { ...item, actor: { ...item.actor, id: "00000000-0000-4000-8000-000000000001" } },
    { ...item, details: { ...item.details, password: "fixture-secret" } },
    { ...item, databaseRelation: {} },
  ]) assert.throws(() => parseAuditReadResponse({ items: [mutation], nextCursor: null, hasMore: false }), AuditContractError);
});
