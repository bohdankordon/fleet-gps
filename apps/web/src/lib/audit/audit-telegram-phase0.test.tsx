import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AuditEventTable } from "../../components/audit-viewer";
import { AUDIT_EVENT_LABELS, auditDetailsLines } from "./audit-ui-model";
import { parseAuditReadResponse } from "./audit-contract";
import { translate } from "../../i18n/core";
import type { AppLocale } from "../../i18n/locales";

const AT = "2026-08-11T02:00:00.000Z";
const TARGET = "00000000-0000-4000-8000-000000000002";
const id = (n: number): string => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");

test("Phase0 telegram audit regression: labels exist in UK RU EN and details are safe", () => {
  for (const locale of ["ru", "uk", "en"] as AppLocale[]) {
    assert.notEqual(translate(locale, "audit.event.TELEGRAM_LINKED"), "audit.event.TELEGRAM_LINKED");
    assert.notEqual(translate(locale, "audit.event.TELEGRAM_DISCONNECTED"), "audit.event.TELEGRAM_DISCONNECTED");
  }
  assert.ok(AUDIT_EVENT_LABELS.TELEGRAM_LINKED);
  const parsed = parseAuditReadResponse({ items: [{ createdAt: AT, actor: { type: "USER", login: "operator" }, id: id(50), eventType: "TELEGRAM_LINKED", target: { type: "USER", id: TARGET }, details: { status: "AVAILABLE" } }], nextCursor: null, hasMore: false });
  const item = parsed.items[0]!;
  assert.equal(auditDetailsLines(item).length, 1);
  const html = renderToStaticMarkup(<AuditEventTable items={parsed.items} />);
  assert.equal(html.includes(AUDIT_EVENT_LABELS.TELEGRAM_LINKED), true);
});
