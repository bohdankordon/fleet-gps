import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { positionHistoryStatusFixture } from "../lib/position-history-status/position-history-status-fixture";
import { formatDateTime } from "../i18n/formatting";
import { PositionHistoryStatusView } from "./position-history-status-view";

test("renders policy, anchor, fleet, backfill, observation, checkpoint, and bounded operation language", () => {
  const html = renderToStaticMarkup(<PositionHistoryStatusView anchor="2026-08-11T02:00:00.000Z" data={positionHistoryStatusFixture()} error={null} formAction="/admin/history/population" />);
  for (const expected of ["История GPS", "История GPS: 90 дней", "Запуск и наблюдение за заполнением истории", formatDateTime("ru", "2026-08-11T02:00:00.000Z")!, "Provider-disabled", "Целей обработано", "GPS-наблюдения", "Строк наблюдений", "COMPLETED", "RUNNING", "PENDING", "NONE", "Операционные режимы", "6 / 12 / 24", "500 / 1000 / 5000", "Контрольная точка", "Europe/Kyiv", "history-checkpoint-trigger", "history-checkpoint-summary"]) assert.ok(html.includes(expected), expected);
  const table = html.slice(html.indexOf("<tbody>"));
  assert.equal(table.indexOf(formatDateTime("ru", "2026-08-04T02:00:00.000Z")!) < table.indexOf(formatDateTime("ru", "2026-05-13T02:00:00.000Z")!), true, "newest slice is presented first");
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ""), /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.doesNotMatch(html, /datetime-local|DatePicker|RangePicker|TimePicker/);
  assert.doesNotMatch(html, /\d{2}\/\d{2}\/\d{4}|AM|PM/);
  for (const forbidden of ["GPS completeness", "GPS coverage", "externalDeviceId", "vehicleId", "latitude", "longitude", "Удалить", "Очистить", "Запустить", "Выполнить", "Retry"]) assert.equal(html.includes(forbidden), false, forbidden);
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.ok(html.includes("<time"));
});

test("malformed anchor state stays visible and has no stale result", () => { const html = renderToStaticMarkup(<PositionHistoryStatusView anchor="2026-08-11T02:00" data={null} error="INVALID_ANCHOR" />); const text = html.replace(/<[^>]+>/g, ""); assert.ok(text.includes("Некорректная контрольная точка")); assert.ok(text.includes("Запрос к backend не отправлен")); assert.equal(text.includes("2026-08-11T02:00"), false); assert.equal(html.includes("Диапазоны заполнения"), false); });
