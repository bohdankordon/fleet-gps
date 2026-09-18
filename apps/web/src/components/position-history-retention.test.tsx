import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { positionHistoryRetentionFixture } from "../lib/position-history-retention/position-history-retention-fixture";
import { PositionHistoryRetention } from "./position-history-retention";
import { createTranslator } from "../i18n/core";
import { formatDateTime } from "../i18n/formatting";
import { I18nProvider } from "../i18n/client";

const t = createTranslator("ru");

const stripped = (html: string) => html.replace(/<[^>]+>/g, "");
const render = (node: React.ReactNode) => renderToStaticMarkup(<I18nProvider locale="ru">{node}</I18nProvider>);

test("renders snapshot, delete/protect comparison, and methodology without KPI cards", () => {
  const html = render(<PositionHistoryRetention data={positionHistoryRetentionFixture()} />);
  for (const expected of [t("history.retention.title"), t("history.retention.snapshotTitle"), "90 дней", formatDateTime("ru", "2026-08-11T02:00:00.000Z")!, formatDateTime("ru", "2026-05-13T02:00:00.000Z")!, t("history.retention.deleteTitle"), t("history.retention.protectedTitle"), t("history.retention.methodTitle"), t("history.retention.obsolete"), t("history.retention.candidates"), t("history.retention.olderObs"), t("history.retention.vehicles"), t("history.retention.oldest"), t("history.retention.newest"), t("history.retention.newerObs"), t("history.retention.overlap"), t("history.retention.protected"), t("history.retention.audit"), t("history.retention.boundaryRule"), t("history.retention.candidateRule"), t("history.retention.manualLimits")] ) assert.ok(html.includes(expected), expected);
  const text = stripped(html);
  assert.match(text, /старше границы\s*3\s*\(ожидающие 1/);
  assert.match(text, /чекпоинтов\s*7(?!\d)/);
  assert.ok(html.includes("<time"));
  assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.ok(html.includes(t("history.retention.overlapWarning")));
  assert.equal(html.includes("admin-history-summary"), false);
  assert.equal((html.match(/<button/g) ?? []).length, 0);
  assert.equal((html.match(/<input/g) ?? []).length, 0);
  for (const forbidden of ["Удалить", "Очистить", "Запустить retention", "Подтвердить удаление", "enable-retention", "retentionDays", "365 дней"]) assert.equal(html.includes(forbidden), false, forbidden);
});

test("boundary warning is absent when there is no overlap", () => {
  const html = render(<PositionHistoryRetention data={positionHistoryRetentionFixture(0)} />);
  assert.equal(html.includes(t("history.retention.overlapWarning")), false);
  assert.ok(html.includes(t("history.retention.audit")));
});

test("USER never sees destructive controls while ADMIN sees only the explicit fixed-budget action when work exists", () => {
  const userHtml = render(<PositionHistoryRetention data={positionHistoryRetentionFixture()} isAdmin={false} />);
  assert.equal(userHtml.includes(t("history.retention.clean")), false);
  const adminHtml = render(<PositionHistoryRetention data={positionHistoryRetentionFixture()} isAdmin />);
  for (const expected of [t("history.retention.clean"), t("history.retention.manualLimits")]) assert.ok(adminHtml.includes(expected), expected);
  for (const forbidden of ["retentionDays", "365 дней", "checkpointBudget", "observationBudget", "<input"]) assert.equal(adminHtml.includes(forbidden), false, forbidden);
});

test("no-work state stays calm with snapshot and protection but no destructive action", () => {
  const fixture = positionHistoryRetentionFixture(0);
  const noWork = { ...fixture, observations: { ...fixture.observations, executableObservationCandidates: 0 }, checkpoints: { ...fixture.checkpoints, fullyObsolete: 0 } };
  const html = render(<PositionHistoryRetention data={noWork} isAdmin />);
  assert.ok(html.includes(t("history.retention.noWork")));
  assert.ok(html.includes(t("history.retention.snapshotTitle")));
  assert.ok(html.includes(t("history.retention.protectedTitle")));
  assert.equal(html.includes(t("history.retention.clean")), false);
});

test("unavailable plan offers retry without any delete action or false no-work", () => {
  const html = render(<PositionHistoryRetention data={null} unavailable isAdmin />);
  assert.ok(html.includes(t("history.retention.unavailable")));
  assert.ok(html.includes(t("common.retry")));
  assert.equal(html.includes(t("history.retention.clean")), false);
  assert.equal(html.includes(t("history.retention.noWork")), false);
});

test("confirmation discloses exact snapshot, ordering, limits, and a single guarded POST", () => {
  const source = readFileSync("src/components/position-history-retention.tsx", "utf8");
  for (const expected of ["history.retention.confirmTitle", "canonicalAnchor", "policyCutoff", "history.retention.obsoleteCount", "history.retention.candidateCount", "history.retention.confirmWarning", "common.cancel", "history.retention.delete", "destructive", "if (!plan || busy) return", "disabled={busy"] ) assert.ok(source.includes(expected), expected);
  assert.equal((source.match(/method: "POST"/g) ?? []).length, 1);
  assert.doesNotMatch(source, /setInterval|setTimeout|keepalive/);
});

test("failures close confirmation, refresh authoritative state, and keep conflicts distinct", () => {
  const source = readFileSync("src/components/position-history-retention.tsx", "utf8");
  for (const expected of ["STALE_PLAN\" ? \"STALE_PLAN\"", "ACTIVE_DURABLE_RUN\" ? \"ACTIVE_DURABLE_RUN\"", "LOCK_UNAVAILABLE\" ? \"LOCK_UNAVAILABLE\"", "PARTIAL_UNKNOWN", "history.retention.error.partial", "setConfirming(false)"]) assert.ok(source.includes(expected), expected);
  assert.ok(((source.match(/await refreshPlan\(\);/g) ?? []).length) >= 4);
});

test("post-execution result stays truthful about deletions and remaining work", () => {
  const source = readFileSync("src/components/position-history-retention.tsx", "utf8");
  for (const expected of ["history.retention.deletedCheckpoints", "history.retention.deletedObservations", "history.retention.remainingCheckpoints", "history.retention.remainingCandidates", "history.retention.resultNoWork", "history.retention.moreWork", "remainingFullyObsoleteCheckpoints", "remainingExecutableObservationCandidates", "stoppedByBudget"]) assert.ok(source.includes(expected), expected);
});

test("retention route stays ADMIN-only and never inherits the history checkpoint anchor", () => {
  const page = readFileSync("src/app/admin/history/retention/page.tsx", "utf8");
  assert.match(page, /user\.role !== "ADMIN"/);
  assert.match(page, /PositionHistoryNavigation anchor=\{null\} isAdmin/);
  assert.doesNotMatch(page, /searchParams|"\\?to/);
  const navigation = readFileSync("src/lib/position-history-navigation.ts", "utf8");
  assert.match(navigation, /\{ href: "\/admin\/history\/retention"/);
});
