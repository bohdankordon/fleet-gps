import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ActiveRun, LastShortResult, RecentRuns } from "../../components/position-history-population-workspace";
import { I18nProvider } from "../../i18n/client";
import type { SafeDurableRun } from "../position-history-durable-runs/position-history-durable-run-contract";

const exact = "2026-08-11T02:00:00.000Z";
const active: SafeDurableRun = { id: "00000000-0000-4000-8000-000000000123", status: "PENDING", initiatorType: "SYSTEM", to: exact, excludeProviderDisabled: true, windowBudget: 1000, committedWindows: 0, createdAt: exact, startedAt: null, finishedAt: null, failureCategory: null };
test("populate UI source has exact defaults, confirmation gate, pending guard, safe result and no expansive controls", () => {
  const source = readFileSync("src/components/position-history-population-workspace.tsx", "utf8");
  for (const expected of ["useState<ShortBudget>(24)", "useState<DurableRunBudget>(1000)", "useState(true)", "Segmented", "AlertDialog", "history.population.confirmShortTitle", "history.population.confirmDurableTitle", "common.cancel", "if (anchor === null || submitting.current) return", "disabled={pending}", "history.population.shortConflictTitle", "history.population.shortFailedTitle", "LastShortResult", "history.population.rateLimits", "router.refresh()"] ) assert.ok(source.includes(expected), expected);
  assert.match(source, /options=\{\[6, 12, 24\]\.map/); assert.match(source, /to: anchor, maxWindows: shortBudget, excludeProviderDisabled/);
  assert.match(source, /to: anchor, windowBudget: durableBudget, excludeProviderDisabled/);
  assert.equal((source.match(/executeAndRefreshPositionHistory/g) ?? []).length, 2, "one import and one short POST path");
  assert.equal((source.match(/submitDurableRun/g) ?? []).length, 2, "one import and one durable POST path");
  for (const forbidden of ["unlimited", "Без лимита", "Pause", "Resume", "Приостановить", "Возобновить", "Удалить", "Очистить", "retry-same-run", "setInterval("]) assert.equal(source.includes(forbidden), false, forbidden);
});

test("population route is a dedicated workspace and does not recreate Overview or retention", () => {
  const page = readFileSync("src/app/admin/history/population/page.tsx", "utf8");
  const workspace = readFileSync("src/components/position-history-population-workspace.tsx", "utf8");
  assert.match(page, /PositionHistoryPopulationWorkspace/);
  assert.doesNotMatch(page, /PositionHistoryStatusView|PositionHistoryOverview|PositionHistoryRetention/);
  for (const forbidden of ["history.overview.processing.title", "history.overview.observations.title", "history.overview.slices.title", "history.retention."]) assert.equal(workspace.includes(forbidden), false, forbidden);
});

test("active, recent, permission and responsive composition remain truthful", () => {
  const source = readFileSync("src/components/position-history-population-workspace.tsx", "utf8");
  const styles = readFileSync("src/styles/admin-history-overview.css", "utf8");
  for (const expected of ["active && <ActiveRun", "!active && activeUnavailable", "shouldShowDurableCreateControls", "recentUnavailable", "history.population.noRecentRuns", "history-population-recent__table", "history-population-recent__records", "aria-live=\"polite\"", "aria-busy={pending}"]) assert.ok(source.includes(expected), expected);
  assert.match(styles, /@media \(max-width:1349px\)[\s\S]*history-population-main/);
  assert.match(styles, /@media \(max-width:768px\)[\s\S]*history-population-recent__table \{ display:none; \}[\s\S]*history-population-recent__records \{ display:block; \}/);
  assert.doesNotMatch(styles, /\.history-population[^}]*overflow-x\s*:\s*(auto|scroll)/);
});

test("active unavailable preserves the last-known run and recent unavailable never becomes empty", () => {
  const staleActive = renderToStaticMarkup(<I18nProvider locale="en"><ActiveRun run={active} unavailable /></I18nProvider>);
  assert.match(staleActive, /Waiting to start/);
  assert.match(staleActive, /last known state/);
  assert.match(staleActive, /0 \/ 1,000/);
  const unavailableRecent = renderToStaticMarkup(<I18nProvider locale="en"><RecentRuns runs={[]} unavailable /></I18nProvider>);
  assert.match(unavailableRecent, /Recent runs are unavailable/);
  assert.doesNotMatch(unavailableRecent, /No recent durable runs/);
  const staleRecent = renderToStaticMarkup(<I18nProvider locale="en"><RecentRuns runs={[{ ...active, status: "FAILED", startedAt: exact, finishedAt: exact, committedWindows: 24, failureCategory: "WORKER" }]} unavailable /></I18nProvider>);
  assert.match(staleRecent, /last known list is retained/i);
  assert.match(staleRecent, /background worker/);
  assert.match(staleRecent, /24 \/ 1,000/);
});

test("last short result leads with decision facts and progressively discloses every factual metric", () => {
  const result = { to: exact, maxWindows: 24, excludeProviderDisabled: true, committedWindows: 12, providerRequests: 11, rowsReceived: 10, candidates: 9, inserted: 8, duplicates: 7, invalid: 6, retries: 5, rateLimits: 4, slicesTotal: 3, slicesVisited: 2, slicesAlreadyComplete: 1, providerDisabledExcluded: 13, stoppedByBudget: true, horizonComplete: false } as const;
  const html = renderToStaticMarkup(<I18nProvider locale="en"><LastShortResult result={result} /></I18nProvider>);
  for (const expected of ["Last short-population result", "12 / 24", "Horizon complete", "Budget exhausted", "Provider-disabled", "Detailed metrics"]) assert.ok(html.includes(expected), expected);
  const source = readFileSync("src/components/position-history-population-workspace.tsx", "utf8");
  for (const key of ["requests", "rows", "candidates", "inserted", "duplicates", "invalid", "retries", "rateLimits", "disabledSkipped", "slices", "slicesTotal", "slicesAlreadyComplete"]) assert.ok(source.includes(`history.population.${key}`), key);
  assert.match(html, /not durable run history/);
  assert.match(html, /ant-collapse/);
});

test("history page grants the block through effective populate authority including ADMIN", () => {
  const page = readFileSync("src/app/admin/history/population/page.tsx", "utf8"); const proxy = readFileSync("src/proxy.ts", "utf8");
  assert.match(page, /hasPermission\(user, "historyAdmin\.populate"\)/); assert.match(proxy, /horizon-populate"\) return \["historyAdmin\.populate"\]/);
});
