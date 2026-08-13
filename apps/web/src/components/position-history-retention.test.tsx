import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { positionHistoryRetentionFixture } from "../lib/position-history-retention/position-history-retention-fixture";
import { PositionHistoryRetention } from "./position-history-retention";

test("renders factual policy, observation, checkpoint, and read-only safety data", () => {
  const html = renderToStaticMarkup(<PositionHistoryRetention data={positionHistoryRetentionFixture()} />);
  for (const expected of ["Хранение истории", "90 дней", "2026-08-11T02:00:00.000Z", "2026-05-13T02:00:00.000Z", "GPS-наблюдений всего", ">100<", "Старше границы политики", ">20<", "Затронуто автомобилей", ">4<", "Checkpoint’ов всего", "Полностью старше границы", "Пересекают границу", "Защищены", "Изменения не выполняются", "включают обе границы", "факт политики"] ) assert.ok(html.includes(expected), expected);
  assert.ok(html.includes("Некоторые checkpoint-диапазоны пересекают границу хранения"));
  assert.ok(html.includes("этот экран ничего не удаляет"));
  assert.equal((html.match(/<button/g) ?? []).length, 0);
  assert.equal((html.match(/<input/g) ?? []).length, 0);
  for (const forbidden of ["Удалить", "Очистить", "Запустить retention", "Подтвердить удаление", "enable-retention", "retentionDays", "365 дней"]) assert.equal(html.includes(forbidden), false, forbidden);
});

test("boundary warning is absent when there is no overlap", () => {
  const html = renderToStaticMarkup(<PositionHistoryRetention data={positionHistoryRetentionFixture(0)} />);
  assert.equal(html.includes("Некоторые checkpoint-диапазоны пересекают границу хранения"), false);
  assert.ok(html.includes("Изменения не выполняются"));
});
