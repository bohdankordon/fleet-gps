import assert from "node:assert/strict";
import test from "node:test";
import { AUDIT_EVENT_TYPES, AuditContractError, parseAuditReadResponse } from "./audit-contract";
import { auditResponseFixture } from "./audit-fixture";

test("accepts safe typed details for all audit event types", () => {
  const parsed = parseAuditReadResponse(auditResponseFixture());
  assert.deepEqual(parsed.items.map((item) => item.eventType), AUDIT_EVENT_TYPES);
  assert.equal(parsed.items.every((item) => item.details.status === "AVAILABLE"), true);
});

test("accepts both current and historical retention audit detail shapes", () => {
  const response = auditResponseFixture();
  const retention = response.items.find((item) => item.eventType === "RETENTION_EXECUTED")!;
  const legacy = { status: "AVAILABLE", canonicalAnchor: "2026-08-11T02:00:00.000Z", policyCutoff: "2026-05-13T02:00:00.000Z", deletedCheckpoints: 1, deletedObservations: 2, remainingFullyObsoleteCheckpoints: 3, remainingExecutableObservationCandidates: 4, stoppedByBudget: true };
  assert.equal(parseAuditReadResponse({ items: [{ ...retention, details: legacy }], nextCursor: null, hasMore: false }).items[0]?.details.status, "AVAILABLE");
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
