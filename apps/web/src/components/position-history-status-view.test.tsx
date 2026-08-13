import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { positionHistoryStatusFixture } from "../lib/position-history-status/position-history-status-fixture";
import { PositionHistoryStatusView } from "./position-history-status-view";

test("renders policy, anchor, fleet, backfill, observation, checkpoint, and bounded operation language", () => {
  const html = renderToStaticMarkup(<PositionHistoryStatusView anchor="2026-08-11T02:00:00.000Z" data={positionHistoryStatusFixture()} error={null} />);
  for (const expected of ["История GPS", "История GPS: 90 дней", "План на контрольную точку", "2026-08-11T02:00:00.000Z", "Provider-disabled", "Целей обработано", "GPS-наблюдения", "Строк наблюдений", "COMPLETED", "RUNNING", "PENDING", "NONE", "Операционные режимы", "6 / 12 / 24", "500 / 1000 / 5000"]) assert.ok(html.includes(expected), expected);
  const table = html.slice(html.indexOf("<tbody>"));
  assert.equal(table.indexOf("2026-08-04T02:00:00.000Z") < table.indexOf("2026-05-13T02:00:00.000Z"), true, "newest slice is presented first");
  for (const forbidden of ["GPS completeness", "GPS coverage", "externalDeviceId", "vehicleId", "latitude", "longitude", "Удалить", "Очистить", "Запустить", "Выполнить", "Retry", "Cancel"]) assert.equal(html.includes(forbidden), false, forbidden);
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.ok(html.includes("Пересчитать статус"));
});

test("malformed anchor state stays visible and has no stale result", () => { const html = renderToStaticMarkup(<PositionHistoryStatusView anchor="2026-08-11T02:00" data={null} error="INVALID_ANCHOR" />); assert.ok(html.includes("Некорректная контрольная точка")); assert.ok(html.includes("Запрос к backend не отправлен")); assert.ok(html.includes("2026-08-11T02:00")); assert.equal(html.includes("Диапазоны заполнения"), false); });
