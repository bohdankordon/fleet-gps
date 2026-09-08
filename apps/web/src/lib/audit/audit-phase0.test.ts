import assert from "node:assert/strict";
import test from "node:test";
import { AUDIT_EVENT_TYPES, AuditContractError, parseAuditReadResponse, SETTINGS_AUDIT_CHANGES_MAX } from "./audit-contract";
import { auditResponseFixture } from "./audit-fixture";

const ADMIN_SETTINGS_FIELDS = ["timezone", "minimumDailyDistanceMeters", "positionFreshnessSeconds", "speedRuleEnabled", "citySpeedLimitKph", "outsideCitySpeedLimitKph", "speedToleranceKph", "speedingConfirmationUpdates", "inactivityRuleEnabled", "inactivityDistanceMeters", "inactivityDurationMinutes", "tripMovementSpeedKph", "tripMovementConfirmationSeconds", "tripStopConfirmationSeconds", "tripDataGapSeconds", "cityGeofenceGeoJson"] as const;
const AT = "2026-08-11T02:00:00.000Z";
const TARGET = "00000000-0000-4000-8000-000000000002";
const common = { createdAt: AT, actor: { type: "USER", login: "operator" } };
const id = (index: number): string => "00000000-0000-4000-8000-" + String(index).padStart(12, "0");
function telegramItem(eventType: "TELEGRAM_LINKED" | "TELEGRAM_DISCONNECTED", index: number): any { return { ...common, id: id(index), eventType, target: { type: "USER", id: TARGET }, details: { status: "AVAILABLE" } }; }

test("Phase0 audit 1: TELEGRAM_LINKED accepted by Web contract", () => {
  const parsed = parseAuditReadResponse({ items: [telegramItem("TELEGRAM_LINKED", 21)], nextCursor: null, hasMore: false });
  assert.equal(parsed.items[0]?.eventType, "TELEGRAM_LINKED");
});
test("Phase0 audit 2: TELEGRAM_DISCONNECTED accepted", () => {
  const parsed = parseAuditReadResponse({ items: [telegramItem("TELEGRAM_DISCONNECTED", 22)], nextCursor: null, hasMore: false });
  assert.equal(parsed.items[0]?.eventType, "TELEGRAM_DISCONNECTED");
});
test("Phase0 audit 3: existing audit types remain accepted", () => {
  const parsed = parseAuditReadResponse(auditResponseFixture());
  assert.deepEqual(parsed.items.map((i: any) => i.eventType), [...AUDIT_EVENT_TYPES]);
});
test("Phase0 audit 4: maximum legitimate SETTINGS_UPDATED change set is accepted", () => {
  assert.equal(SETTINGS_AUDIT_CHANGES_MAX, 16);
  const changes = (ADMIN_SETTINGS_FIELDS as readonly string[]).map((field: string, i: number) => ({ field, previous: i, next: i + 1 }));
  assert.equal(changes.length, 16);
  const parsed = parseAuditReadResponse({ items: [{ ...common, id: id(30), eventType: "SETTINGS_UPDATED", target: { type: "APPLICATION_SETTINGS", id: "1" }, details: { status: "AVAILABLE", changes } }], nextCursor: null, hasMore: false });
  assert.equal(parsed.items[0]?.details.status, "AVAILABLE");
});
test("Phase0 audit 5: over-bound payload remains rejected", () => {
  const changes = Array.from({ length: 17 }, (_: unknown, i: number) => ({ field: "f" + i, previous: 0, next: 1 }));
  assert.throws(() => parseAuditReadResponse({ items: [{ ...common, id: id(31), eventType: "SETTINGS_UPDATED", target: { type: "APPLICATION_SETTINGS", id: "1" }, details: { status: "AVAILABLE", changes } }], nextCursor: null, hasMore: false }), AuditContractError);
});
test("Phase0 audit 6: sensitive Telegram values are not introduced", () => {
  for (const extra of [{ linkToken: "secret" }, { botSecret: "s" }, { chatSecret: "s" }]) {
    assert.throws(() => parseAuditReadResponse({ items: [{ ...telegramItem("TELEGRAM_LINKED", 23), details: { status: "AVAILABLE", ...extra } }], nextCursor: null, hasMore: false }), AuditContractError);
  }
});
test("Phase0 audit: viewer does not fail entire page when Telegram event present", () => {
  const base = auditResponseFixture();
  const mixed: any = { items: [telegramItem("TELEGRAM_LINKED", 24), ...base.items.slice(0, 2)], nextCursor: null, hasMore: false };
  assert.equal(parseAuditReadResponse(mixed).items.length, 3);
});
test("Repair audit duplicate 1: one timezone change accepted", () => {
  const parsed = parseAuditReadResponse({ items: [{ ...common, id: id(40), eventType: "SETTINGS_UPDATED", target: { type: "APPLICATION_SETTINGS", id: "1" }, details: { status: "AVAILABLE", changes: [{ field: "timezone", previous: "Europe/Kyiv", next: "UTC" }] } }], nextCursor: null, hasMore: false });
  assert.equal(parsed.items[0]?.eventType, "SETTINGS_UPDATED");
});
test("Repair audit duplicate 2: multiple distinct fields accepted", () => {
  const changes = [{ field: "timezone", previous: "Europe/Kyiv", next: "UTC" }, { field: "citySpeedLimitKph", previous: 50, next: 55 }];
  assert.equal(parseAuditReadResponse({ items: [{ ...common, id: id(41), eventType: "SETTINGS_UPDATED", target: { type: "APPLICATION_SETTINGS", id: "1" }, details: { status: "AVAILABLE", changes } }], nextCursor: null, hasMore: false }).items.length, 1);
});
test("Repair audit duplicate 4-5: duplicate fields rejected", () => {
  const dupTimezone = [{ field: "timezone", previous: "A", next: "B" }, { field: "timezone", previous: "B", next: "C" }];
  assert.throws(() => parseAuditReadResponse({ items: [{ ...common, id: id(42), eventType: "SETTINGS_UPDATED", target: { type: "APPLICATION_SETTINGS", id: "1" }, details: { status: "AVAILABLE", changes: dupTimezone } }], nextCursor: null, hasMore: false }), AuditContractError);
  const dupOther = [{ field: "citySpeedLimitKph", previous: 50, next: 55 }, { field: "citySpeedLimitKph", previous: 55, next: 60 }];
  assert.throws(() => parseAuditReadResponse({ items: [{ ...common, id: id(43), eventType: "SETTINGS_UPDATED", target: { type: "APPLICATION_SETTINGS", id: "1" }, details: { status: "AVAILABLE", changes: dupOther } }], nextCursor: null, hasMore: false }), AuditContractError);
});
