import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
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

test("USER never sees destructive controls while ADMIN sees only the explicit fixed-budget action when work exists", () => {
  const userHtml = renderToStaticMarkup(<PositionHistoryRetention data={positionHistoryRetentionFixture()} isAdmin={false} />);
  assert.equal(userHtml.includes("Очистить устаревшую историю"), false);
  const adminHtml = renderToStaticMarkup(<PositionHistoryRetention data={positionHistoryRetentionFixture()} isAdmin />);
  for (const expected of ["Очистить устаревшую историю", "до 5 000 checkpoint’ов", "до 25 000 GPS-наблюдений", "Автоматического запуска нет"]) assert.ok(adminHtml.includes(expected), expected);
  for (const forbidden of ["retentionDays", "365 дней", "checkpointBudget", "observationBudget", "<input"]) assert.equal(adminHtml.includes(forbidden), false, forbidden);
});

test("ADMIN no-work state has no enabled destructive action", () => {
  const fixture = positionHistoryRetentionFixture(0);
  const noWork = { ...fixture, observations: { ...fixture.observations, executableObservationCandidates: 0 }, checkpoints: { ...fixture.checkpoints, fullyObsolete: 0 } };
  const html = renderToStaticMarkup(<PositionHistoryRetention data={noWork} isAdmin />);
  assert.ok(html.includes("Нет данных для очистки"));
  assert.equal(html.includes("Очистить устаревшую историю"), false);
});

test("confirmation source discloses snapshot, ordering, protection, irreversibility, limits, cancel, and one non-retried POST", () => {
  const source = readFileSync("src/components/position-history-retention.tsx", "utf8");
  for (const expected of ["Подтвердите необратимую очистку", "canonicalAnchor", "policyCutoff", "Сначала удаляется checkpoint-истина", "Пересекающие границу диапазоны остаются защищёнными", "5 000 / 25 000", "Отмена", "Удалить устаревшую историю"]) assert.ok(source.includes(expected), expected);
  assert.equal((source.match(/method: "POST"/g) ?? []).length, 1);
  assert.doesNotMatch(source, /retry|setInterval|setTimeout/);
});
