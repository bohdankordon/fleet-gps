import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/client";
import { createTranslator } from "../i18n/core";
import { SUPPORTED_LOCALES } from "../i18n/locales";
import { positionHistoryIngestionStatusFixture, positionHistoryIngestionStatusStateFixture } from "../lib/position-history-ingestion-status/position-history-ingestion-status-fixture";
import { PositionHistoryOverview } from "./position-history-overview";

type Props = Parameters<typeof PositionHistoryOverview>[0];

function renderOverview(overrides: Partial<Props> = {}, locale: "ru" | "uk" | "en" = "ru"): string {
  return renderToStaticMarkup(<I18nProvider locale={locale}><PositionHistoryOverview data={positionHistoryIngestionStatusStateFixture("CURRENT")} statusError={null} administrationNavigation={<nav>Administration</nav>} historyNavigation={<nav>History sections</nav>} {...overrides} /></I18nProvider>);
}

test("current overview answers ingestion, cursor, recent-tail, replay, and retention questions factually", () => {
  const html = renderOverview();
  for (const expected of ["Непрерывное заполнение", "Непрерывная обработка", "Опрос запущен", "Покрытие курсоров", "Машин привязано к провайдеру", "58", "Медианное отставание", "Свежий хвост", "Обработано чекпоинтов", "58 / 58", "754 / 754", "Ежедневный повтор 7 дней", "Скользящий повтор 90 дней", "Хранение истории", "Граница согласована", "Следующий запуск"]) assert.ok(html.includes(expected), expected);
  assert.ok(html.indexOf("Покрытие курсоров") < html.indexOf("Повторные проходы"));
  assert.match(html, /history-fact-descriptions/);
  assert.match(html, /history-replay__grid/);
  for (const forbidden of ["Запустить дозаполнение", "План хранения", "GPS completeness", "GPS coverage", "Строк наблюдений"]) assert.equal(html.includes(forbidden), false, forbidden);
});

test("daily and rolling replay render current and overdue generations truthfully", () => {
  const current = renderOverview();
  assert.equal((current.match(/Текущее поколение завершено/g) ?? []).length, 2);
  assert.equal(current.includes("Обнаружен долг повтора"), false);
  const debt = renderOverview({ data: positionHistoryIngestionStatusStateFixture("DEBT") });
  assert.equal((debt.match(/Обнаружен долг повтора/g) ?? []).length, 2);
  assert.ok(debt.includes("Просроченных поколений: 2"));
  assert.ok(debt.includes("Просроченных поколений: 1"));
  assert.ok(debt.includes("Пропущено"));
  assert.ok(debt.includes("История занята другой операцией"));
  assert.equal(debt.includes("Текущее поколение завершено"), false);
});

test("latest 0/0 yields to oldest incomplete rolling progress and safe process diagnostics", () => {
  const debt = positionHistoryIngestionStatusStateFixture("DEBT");
  const html = renderOverview({ data: debt }, "uk");
  assert.ok(html.includes("Найстаріше незавершене покоління"));
  assert.ok(html.includes("366 / 741"));
  assert.ok(html.includes("10 488") || html.includes("10,488"));
  assert.ok(html.includes("Діапазон найстарішого незавершеного покоління"));
  assert.ok(html.includes(`dateTime="${debt.replay.rolling.oldestIncompleteRangeFrom}"`));
  assert.ok(html.includes(`dateTime="${debt.replay.rolling.oldestIncompleteRangeTo}"`));
  assert.equal(html.includes(`dateTime="${debt.replay.rolling.rangeFrom}"`), false, "latest range must not be presented as oldest progress range");
  assert.ok(html.includes("Останнє покоління"));
  assert.ok(html.includes("Останнє покоління актуальне"));
  assert.ok(html.includes("новіше найстарішого незавершеного"));
  assert.equal(html.includes("0 / 0"), false);
  const source = readFileSync("src/components/position-history-overview.tsx", "utf8");
  assert.match(source, /failureCategoryKeys\[data\.providerTraffic\.lastFailureCategory\]/);
  assert.match(source, /data\.runtime\.maxCycleDurationMsSinceProcessStart/);
  assert.equal(createTranslator("uk")("history.diagnostics.failure.timeout"), "Таймаут");
  assert.equal(html.includes("raw exception"), false);
});

test("unavailable status is never rendered as a factual zero", () => {
  const html = renderOverview({ data: null, statusError: "UNAVAILABLE" });
  assert.ok(html.includes("Текущее состояние истории недоступно"));
  assert.ok(html.includes("Показатели не заменяются нулями"));
  assert.ok(html.includes("Administration") && html.includes("History sections"), "page shell and navigation survive");
  assert.equal(html.includes("history-fact-groups"), false);
  assert.equal(html.includes("Покрытие курсоров"), false);
  assert.equal(html.includes("Обнаружен долг повтора"), false);
});

test("process-local telemetry is labelled as process-local and never as durable lifetime truth", () => {
  const html = renderOverview();
  assert.ok(html.includes("Диагностика"));
  assert.ok(html.includes("Счётчики текущего процесса API"));
  assert.ok(html.includes("Успехов с запуска процесса"));
  const source = readFileSync("src/components/position-history-overview.tsx", "utf8");
  for (const expected of ["history.diagnostics.scopeText", "history.diagnostics.lockContention", "history.diagnostics.blockedStreams", "history.diagnostics.requestRate"]) assert.ok(source.includes(expected), expected);
  assert.match(source, /history\.overview\.definitions\.process/);
  assert.match(source, /history\.diagnostics\.scopeText/);
  assert.doesNotMatch(source, /за всё время работы/);
  assert.ok(createTranslator("ru")("history.diagnostics.scopeText").includes("не накопленные итоги"));
  assert.ok(createTranslator("ru")("history.overview.definitions.debt").includes("не обязательно сбой"));
});

test("an active durable population run is an aggregate strip that links without claiming progress", () => {
  const html = renderOverview({ data: positionHistoryIngestionStatusStateFixture("REPLAYING") });
  assert.ok(html.includes("Сейчас выполняется ручное дозаполнение истории"));
  assert.ok(html.includes("Показано только агрегированное состояние"));
  assert.match(html, /href="\/admin\/history\/population"/);
  const source = readFileSync("src/components/position-history-overview.tsx", "utf8");
  assert.match(source, /data\.coordination\.durablePopulationActive/);
  assert.doesNotMatch(source, /fetchActiveDurableRun|SafeDurableRun|committedWindows/);
});

test("the overview route reads current ingestion status and needs no generated now-anchor redirect", () => {
  const page = readFileSync("src/app/admin/history/page.tsx", "utf8");
  const overview = readFileSync("src/components/position-history-overview.tsx", "utf8");
  assert.match(page, /fetchPositionHistoryIngestionStatus/);
  assert.doesNotMatch(page, /fetchPositionHistoryStatus|horizon-status|fetchActiveDurableRun|fetchRecentDurableRuns|fetchPositionHistoryRetentionPlan/);
  assert.doesNotMatch(page, /redirect\(|searchParams|resolved\.absent|toISOString/);
  assert.match(page, /export const revalidate = 0/);
  assert.doesNotMatch(overview, /PositionHistoryCheckpointControl|resolvePositionHistoryAnchor|positionHistoryAnchorHref|formAction=/);
  assert.doesNotMatch(overview, /observations\.rowCount|vehiclesWithObservations|sliceStatuses/);
});

test("every new overview message key exists in uk, ru, and en", () => {
  const keys = [
    "history.overview.description", "history.overview.asOf", "history.overview.boundary", "history.overview.population.active", "history.overview.population.activeText",
    "history.ingestion.title", "history.ingestion.help", "history.ingestion.continuous", "history.ingestion.retention", "history.ingestion.poller", "history.ingestion.cycle", "history.ingestion.cycleStart", "history.ingestion.cycleEnd", "history.ingestion.processStart", "history.ingestion.unavailableTitle", "history.ingestion.unavailableText",
    "history.cursor.title", "history.cursor.help", "history.cursor.mapped", "history.cursor.present", "history.cursor.missing", "history.cursor.medianLag", "history.cursor.worstLag", "history.cursor.oldest", "history.cursor.boundary",
    "history.recentTail.title", "history.recentTail.help", "history.recentTail.lastSuccess", "history.recentTail.successes", "history.recentTail.failures",
    "history.replay.title", "history.replay.help", "history.replay.daily", "history.replay.rolling", "history.replay.state.notCreated", "history.replay.state.pending", "history.replay.state.running", "history.replay.state.completed", "history.replay.completed", "history.replay.remaining", "history.replay.generation", "history.replay.oldestIncompleteGeneration", "history.replay.latestGeneration", "history.replay.newer", "history.replay.newerIncompleteCount", "history.replay.estimatedWindows", "history.replay.estimateHelp", "history.replay.oldestIncompleteRange", "history.replay.latestRange", "history.replay.latestCurrent", "history.replay.incomplete", "history.replay.overdue", "history.replay.debt", "history.replay.oldestOverdue", "history.replay.debtTitle", "history.replay.debtText", "history.replay.currentTitle", "history.replay.currentText",
    "history.retentionState.help", "history.retentionState.enabled", "history.retentionState.running", "history.retentionState.lastAttempt", "history.retentionState.lastCompleted", "history.retentionState.outcome", "history.retentionState.outcome.notObserved", "history.retentionState.outcome.success", "history.retentionState.outcome.skipped", "history.retentionState.outcome.failed", "history.retentionState.skipCategory", "history.retentionState.skip.lockUnavailable", "history.retentionState.skip.activePopulation", "history.retentionState.nextExecution", "history.retentionState.floor", "history.retentionState.behind", "history.retentionState.atOrBeyond", "history.retentionState.aligned",
    "history.diagnostics.title", "history.diagnostics.scope", "history.diagnostics.scopeText", "history.diagnostics.requestRate", "history.diagnostics.requestStarts", "history.diagnostics.retries", "history.diagnostics.rateLimits", "history.diagnostics.provider5xx", "history.diagnostics.network", "history.diagnostics.timeouts", "history.diagnostics.contract", "history.diagnostics.storage", "history.diagnostics.providerBlocked", "history.diagnostics.unknown", "history.diagnostics.lockContention", "history.diagnostics.blockedStreams", "history.diagnostics.lastFailureCategory", "history.diagnostics.lastFailureAt", "history.diagnostics.cyclesCompleted", "history.diagnostics.lastCycleDuration", "history.diagnostics.maxCycleDuration", "history.diagnostics.slowCycles", "history.diagnostics.ms", "history.diagnostics.failure.rateLimit", "history.diagnostics.failure.provider5xx", "history.diagnostics.failure.network", "history.diagnostics.failure.timeout", "history.diagnostics.failure.contract", "history.diagnostics.failure.storage", "history.diagnostics.failure.providerBlocked", "history.diagnostics.failure.unknown",
    "history.overview.definitions.title", "history.overview.definitions.durable", "history.overview.definitions.process", "history.overview.definitions.boundary", "history.overview.definitions.debt",
  ] as const;
  for (const locale of SUPPORTED_LOCALES) {
    const t = createTranslator(locale);
    for (const key of keys) {
      const message = t(key);
      assert.ok(message.length > 1, locale + ":" + key);
      assert.notEqual(message, key, locale + ":" + key);
    }
    assert.equal(t("history.replay.daily").includes("DAILY"), false);
    assert.equal(t("history.replay.rolling").includes("ROLLING"), false);
  }
});

test("overview keeps responsive facts without a desktop-only wide table", () => {
  const overview = readFileSync("src/components/position-history-overview.tsx", "utf8");
  const styles = readFileSync("src/styles/admin-history-overview.css", "utf8");
  assert.doesNotMatch(overview, /<table>/);
  assert.doesNotMatch(styles, /overflow-x\s*:\s*(auto|scroll)/);
  assert.match(styles, /@media \(max-width:991px\)[\s\S]*\.history-replay__grid \{ grid-template-columns:minmax\(0,1fr\); \}/);
  assert.match(styles, /\.history-fact-value,\.history-numeric \{[^}]*white-space:nowrap/);
});

test("ingestion status fixture states stay contract-valid and keep the empty baseline independent", () => {
  const empty = positionHistoryIngestionStatusFixture();
  assert.equal(empty.replay.daily.hasReplayDebt, false);
  assert.equal(empty.cursor.mappedVehicles, 0);
  for (const state of ["CURRENT", "REPLAYING", "DEBT"] as const) {
    const fixture = positionHistoryIngestionStatusStateFixture(state);
    assert.equal(fixture.cursor.cursorCount + fixture.cursor.missingCursorCount, fixture.cursor.mappedVehicles, state);
    assert.equal(fixture.replay.daily.checkpointsCompleted + fixture.replay.daily.checkpointsRemaining, fixture.replay.daily.checkpointsTotal, state);
    assert.equal(fixture.replay.daily.hasReplayDebt, fixture.replay.daily.overdueIncompleteGenerations > 0, state);
  }
});
