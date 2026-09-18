import assert from "node:assert/strict";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuditEventTable, AuditViewer } from "../../components/audit-viewer";
import { I18nProvider } from "../../i18n/client";
import { AUDIT_SETTINGS_FIELDS, auditDetailPresentation, auditDetailsLines, auditEventLabel, auditPermissionChanges } from "./audit-ui-model";
import { parseAuditReadResponse } from "./audit-contract";
import { auditItemsFixture } from "./audit-fixture";

const renderRu = (node: ReactNode): string => renderToStaticMarkup(<I18nProvider locale="ru">{node}</I18nProvider>);

test("renders newest-first semantic chronology with all event labels and contextual inline detail", () => {
  const items = auditItemsFixture();
  const html = renderRu(<AuditEventTable items={items} selectedId={items[0]!.id} showInlineDetails />);
  for (const item of items) assert.equal(html.includes(auditEventLabel(item.eventType, "ru")), true, item.eventType);
  assert.match(html, /<ol class="audit-chronology__list">/);
  assert.doesNotMatch(html, /<table|audit-table|overflow-x/);
  assert.equal(html.includes("operator"), true);
  assert.equal(html.includes("Система"), true);
  assert.equal(html.indexOf(auditEventLabel("USER_CREATED", "ru")) < html.indexOf(auditEventLabel("AUTOMATIC_RETENTION_EXECUTED", "ru")), true);
  assert.equal(html.includes("Роль: Пользователь"), true);
  for (const item of items) assert.ok(auditDetailsLines(item, "ru").length > 0, item.eventType);
});

test("unavailable details render only safe fallback and never a JSON or secret dump", () => {
  const base = auditItemsFixture()[2]!;
  const item = { ...base, details: { status: "UNAVAILABLE" as const } };
  const html = renderRu(<AuditEventTable items={[item]} />);
  assert.equal(html.includes("Детали события недоступны"), true);
  for (const forbidden of ["password", "temporaryPassword", "sessionToken", "providerUrl", "rawBody", "actorUserId", "{\"", "JSON"]) assert.equal(html.includes(forbidden), false, forbidden);
  assert.deepEqual(auditDetailsLines(item, "ru"), ["Детали события недоступны"]);
});

test("initial viewer renders loading without a false empty state or unsupported controls", () => {
  const html = renderRu(<AuditViewer />);
  for (const expected of ["Аудит", "Вся история", "Фильтры · 0", "Обновить", "Обновление аудита…"]) assert.equal(html.includes(expected), true, expected);
  assert.doesNotMatch(html, /datetime-local|Применить период|id="audit-from"|id="audit-to"/);
  for (const falseEmpty of ["История аудита пока пуста", "По текущим условиям событий нет", "События аудита не найдены."]) assert.equal(html.includes(falseEmpty), false, falseEmpty);
  for (const forbidden of ["Поиск", "Лимит", "Размер страницы", "Экспорт", "CSV", "Удалить", "Очистить"]) assert.equal(html.includes(forbidden), false, forbidden);
});

test("derives permission additions and removals without repeating full sets", () => {
  assert.deepEqual(auditPermissionChanges(["fleet.view", "map.view"], ["map.view", "events.view"]), { added: ["events.view"], removed: ["fleet.view"] });
  const access = auditItemsFixture().find((item) => item.eventType === "USER_ACCESS_CHANGED")!;
  const lines = auditDetailsLines(access, "ru");
  assert.ok(lines.some((line) => line.startsWith("Добавлены права:")));
  assert.ok(lines.some((line) => line.startsWith("Удалены права:")));
  assert.equal(lines.some((line) => line.startsWith("Права до:")), false);
});

test("settings presentation allowlists all 16 fields and never leaks unknown values", () => {
  assert.equal(Object.keys(AUDIT_SETTINGS_FIELDS).length, 16);
  const common = { id: "00000000-0000-4000-8000-000000000099", createdAt: "2026-08-11T02:00:00.000Z", eventType: "SETTINGS_UPDATED", actor: { type: "USER", login: "operator" }, target: { type: "APPLICATION_SETTINGS", id: "1" } } as const;
  const unsafe = parseAuditReadResponse({ items: [{ ...common, details: { status: "AVAILABLE", changes: [{ field: "providerPassword", previous: "old-secret", next: "new-secret" }] } }], nextCursor: null, hasMore: false }).items[0]!;
  const malformedKnown = parseAuditReadResponse({ items: [{ ...common, id: "00000000-0000-4000-8000-000000000098", details: { status: "AVAILABLE", changes: [{ field: "cityGeofenceGeoJson", previous: "29.0001,49.0001", next: "token-secret" }] } }], nextCursor: null, hasMore: false }).items[0]!;
  for (const item of [unsafe, malformedKnown]) {
    const detail = auditDetailPresentation(item, "ru");
    assert.equal(detail.unavailable, true);
    const rendered = renderRu(<AuditEventTable items={[item]} selectedId={item.id} showInlineDetails />);
    for (const forbidden of ["old-secret", "new-secret", "providerPassword", "29.0001", "token-secret"]) assert.equal(rendered.includes(forbidden), false, forbidden);
  }
});
