import assert from "node:assert/strict";
import test from "node:test";
import { AuditActorType, AuditEventType, AuditTargetType } from "../../generated/prisma/enums";
import { AuditReadQueryError, encodeAuditReadCursor, parseAuditReadQuery } from "./audit-read.query";

const ID = "00000000-0000-4000-8000-000000000001";
const FROM = "2026-08-11T02:00:00.000Z";
const TO = "2026-08-12T05:00:00.000+03:00";

test("accepts no filters and every approved exact filter", () => {
  assert.deepEqual(parseAuditReadQuery({}), { eventType: undefined, actorType: undefined, targetType: undefined, from: undefined, to: undefined, cursor: undefined });
  assert.deepEqual(parseAuditReadQuery({ eventType: "USER_DISABLED", actorType: "USER", targetType: "USER", from: FROM, to: TO }), {
    eventType: AuditEventType.USER_DISABLED,
    actorType: AuditActorType.USER,
    targetType: AuditTargetType.USER,
    from: new Date(FROM),
    to: new Date(TO),
    cursor: undefined,
  });
});

test("round-trips an opaque createdAt/id cursor", () => {
  const cursor = encodeAuditReadCursor({ createdAt: new Date(FROM), id: ID });
  assert.equal(cursor.includes("2026"), false);
  assert.deepEqual(parseAuditReadQuery({ cursor }).cursor, { createdAt: new Date(FROM), id: ID });
});

test("rejects invalid enums, non-absolute dates, reversed ranges, and malformed cursors", () => {
  const encoded = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const invalid: readonly Record<string, unknown>[] = [
    { eventType: "OTHER" }, { actorType: "ADMIN" }, { targetType: "VEHICLE" },
    { from: "2026-08-11" }, { from: "2026-08-11T02:00:00" }, { to: "not-a-date" }, { to: "2026-02-30T02:00:00Z" },
    { from: TO, to: FROM }, { cursor: "***" }, { cursor: encoded({}) },
    { cursor: encoded({ createdAt: FROM, id: "bad" }) }, { cursor: encoded({ createdAt: "2026-08-11", id: ID }) },
    { cursor: encoded({ createdAt: FROM, id: ID, details: {} }) }, { eventType: ["USER_DISABLED"] },
  ];
  for (const query of invalid) assert.throws(() => parseAuditReadQuery(query), AuditReadQueryError);
});

test("rejects every unknown or client-controlled pagination/search parameter", () => {
  for (const key of ["limit", "pageSize", "take", "offset", "page", "sort", "search", "login", "actorUserId", "targetId", "details"]) {
    assert.throws(() => parseAuditReadQuery({ [key]: "1" }), AuditReadQueryError, key);
  }
});
