import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { formatDateTime } from "../i18n/formatting";
import { positionHistoryStatusFixture } from "../lib/position-history-status/position-history-status-fixture";
import { PositionHistoryOverview } from "./position-history-overview";

const exact = "2026-08-11T02:00:00.000Z";

function renderOverview(overrides: Partial<Parameters<typeof PositionHistoryOverview>[0]> = {}): string {
  return renderToStaticMarkup(<PositionHistoryOverview anchor={exact} data={positionHistoryStatusFixture()} statusError={null} active={null} activeUnavailable={false} administrationNavigation={<nav>Administration</nav>} historyNavigation={<nav>History sections</nav>} {...overrides} />);
}

test("Overview keeps processing and stored-observation truth in separate groups", () => {
  const html = renderOverview();
  for (const expected of ["Обработка целей", "2 / 6", "Сохранённые наблюдения", "42", "Состояние обработки по диапазонам", "Provider-disabled", "Оценка оставшихся часовых окон"]) assert.ok(html.includes(expected), expected);
  assert.ok(html.indexOf("Обработка целей") < html.indexOf("Сохранённые наблюдения"));
  assert.match(html, /history-slices__table/);
  assert.match(html, /history-slices__records/);
  assert.match(html, /<time dateTime="2026-08-11T02:00:00.000Z"/);
  for (const forbidden of ["Запустить дозаполнение", "Недавние запуски", "План хранения", "GPS completeness", "GPS coverage"]) assert.equal(html.includes(forbidden), false, forbidden);
});

test("successful zero observations is factual, while active-run failure remains independently unavailable", () => {
  const zero = positionHistoryStatusFixture();
  const html = renderOverview({ data: { ...zero, observations: { rowCount: 0, vehiclesWithObservations: 0, vehiclesWithoutObservations: 3, firstObservationAt: null, lastObservationAt: null } }, activeUnavailable: true });
  assert.ok(html.includes("В выбранном горизонте нет сохранённых наблюдений"));
  assert.ok(html.includes("Состояние фонового запуска недоступно"));
  assert.ok(html.includes("Состояние обработки по диапазонам"), "status truth remains visible");
});

test("confirmed no active run renders no strip and status failure fabricates no metrics", () => {
  const confirmedNone = renderOverview();
  assert.equal(confirmedNone.includes("Состояние фонового запуска недоступно"), false);
  assert.equal(confirmedNone.includes("Фоновое заполнение влияет"), false);
  const failed = renderOverview({ data: null, statusError: "UNAVAILABLE" });
  assert.ok(failed.includes("Не удалось загрузить статус"));
  assert.equal(failed.includes("2 / 6"), false);
  assert.equal(failed.includes("Состояние обработки по диапазонам"), false);
});

test("Overview route owns only relevant reads and responsive CSS replaces the table with records", () => {
  const page = readFileSync("src/app/admin/history/page.tsx", "utf8");
  const overview = readFileSync("src/components/position-history-overview.tsx", "utf8");
  const styles = readFileSync("src/styles/admin-history-overview.css", "utf8");
  assert.match(page, /fetchPositionHistoryStatus/);
  assert.match(page, /fetchActiveDurableRun/);
  assert.doesNotMatch(page, /fetchRecentDurableRuns|fetchPositionHistoryRetentionPlan/);
  assert.doesNotMatch(overview, /PositionHistoryPopulation|PositionHistoryDurableRuns|PositionHistoryRetention/);
  assert.match(styles, /@media \(max-width:991px\)[\s\S]*\.history-slices__table \{ display:none; \}[\s\S]*\.history-slices__records \{ display:block; \}/);
  assert.doesNotMatch(styles, /overflow-x\s*:\s*(auto|scroll)/);
});

test("checkpoint uses the accepted popover grammar with explicit Kyiv civil fields and actions", () => {
  const shared = readFileSync("src/components/position-history-checkpoint-control.tsx", "utf8");
  const overview = readFileSync("src/components/position-history-overview.tsx", "utf8");
  const population = readFileSync("src/components/position-history-population-workspace.tsx", "utf8");
  for (const expected of ["PeriodPopover", "history-checkpoint-trigger", "history-checkpoint-editor", "history-checkpoint-date", "history-checkpoint-time", 'placeholder="DD.MM.YYYY"', 'placeholder="HH:mm"', "common.cancel", "history.overview.checkpoint.apply", "kyivLocalToAbsolute", "positionHistoryCheckpointCivil", "positionHistoryCheckpointDraft", 'action={formAction}', 'name="to"']) assert.ok(shared.includes(expected), expected);
  assert.equal((shared.match(/<Input/g) ?? []).length, 2);
  assert.doesNotMatch(shared, /datetime-local|DatePicker|RangePicker|TimePicker|showTime|AM|PM/);
  for (const page of [overview, population]) { assert.match(page, /PositionHistoryCheckpointControl/); assert.doesNotMatch(page, /datetime-local|DatePicker|RangePicker|TimePicker|showTime|anchorDraft|anchorQueryInput/); }
  assert.match(overview, /formAction="\/admin\/history"/);
  assert.match(population, /formAction="\/admin\/history\/population"/);
  assert.match(population, /<PositionHistoryCheckpointControl anchor=\{anchor\}/);
  assert.doesNotMatch(overview, /datetime-local|DatePicker|RangePicker|TimePicker|showTime|AM|PM/);
  assert.doesNotMatch(population, /datetime-local|DatePicker|RangePicker|TimePicker|showTime|AM|PM/);
  for (const locale of ["uk", "ru", "en"] as const) {
    const formatted = formatDateTime(locale, exact) ?? "";
    assert.match(formatted, /05:00/);
    assert.doesNotMatch(formatted, /AM|PM/i);
  }
});

test("factual groups use bordered descriptions and numeric values cannot split", () => {
  const overview = readFileSync("src/components/position-history-overview.tsx", "utf8");
  const styles = readFileSync("src/styles/admin-history-overview.css", "utf8");
  assert.equal((overview.match(/<Descriptions className="history-fact-descriptions" bordered/g) ?? []).length, 2);
  assert.match(styles, /\.history-fact-value,.history-numeric \{[^}]*white-space:nowrap/);
  assert.match(styles, /\.history-state-list strong \{[^}]*white-space:nowrap/);
});
