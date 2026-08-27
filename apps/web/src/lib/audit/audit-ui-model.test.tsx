import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AuditEventTable, AuditViewer } from "../../components/audit-viewer";
import { AUDIT_EVENT_LABELS, auditDetailsLines } from "./audit-ui-model";
import { auditItemsFixture } from "./audit-fixture";

test("renders newest-first typed content, USER/SYSTEM actors, and all Russian event labels", () => {
  const items = auditItemsFixture();
  const html = renderToStaticMarkup(<AuditEventTable items={items} />);
  for (const label of Object.values(AUDIT_EVENT_LABELS)) assert.equal(html.includes(label), true, label);
  assert.equal(html.includes("operator"), true);
  assert.equal(html.includes("Система"), true);
  assert.equal(html.indexOf(AUDIT_EVENT_LABELS.USER_CREATED) < html.indexOf(AUDIT_EVENT_LABELS.AUTOMATIC_RETENTION_EXECUTED), true);
  for (const expected of ["Роль: Пользователь", "Права до:", "Зафиксировано окон: 6", "Удалено GPS-наблюдений: 2"]) assert.equal(html.includes(expected), true, expected);
});

test("unavailable details render only safe fallback and never a JSON or secret dump", () => {
  const base = auditItemsFixture()[2]!;
  const item = { ...base, details: { status: "UNAVAILABLE" as const } };
  const html = renderToStaticMarkup(<AuditEventTable items={[item]} />);
  assert.equal(html.includes("Детали события недоступны"), true);
  for (const forbidden of ["password", "temporaryPassword", "sessionToken", "providerUrl", "rawBody", "actorUserId", "{\"", "JSON"]) assert.equal(html.includes(forbidden), false, forbidden);
  assert.deepEqual(auditDetailsLines(item), ["Детали события недоступны"]);
});

test("empty viewer exposes exact filters, refresh, reset, and no unsupported controls", () => {
  const html = renderToStaticMarkup(<AuditViewer />);
  for (const expected of ["События аудита не найдены.", "Тип события", "Инициатор", "Тип цели", "С", "По", "Применить", "Сбросить", "Обновить"]) assert.equal(html.includes(expected), true, expected);
  for (const forbidden of ["Поиск", "Лимит", "Размер страницы", "Экспорт", "CSV", "Удалить", "Очистить"]) assert.equal(html.includes(forbidden), false, forbidden);
});
