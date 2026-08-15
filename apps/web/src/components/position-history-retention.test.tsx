import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { positionHistoryRetentionFixture } from "../lib/position-history-retention/position-history-retention-fixture";
import { PositionHistoryRetention } from "./position-history-retention";
import { createTranslator } from "../i18n/core";
import { formatDateTime } from "../i18n/formatting";

const t = createTranslator("ru");

test("renders factual policy, observation, checkpoint, and read-only safety data", () => {
  const html = renderToStaticMarkup(<PositionHistoryRetention data={positionHistoryRetentionFixture()} />);
  for (const expected of [t("history.retention.title"), "90 дней", formatDateTime("ru", "2026-08-11T02:00:00.000Z")!, formatDateTime("ru", "2026-05-13T02:00:00.000Z")!, t("history.retention.totalObs"), ">100<", t("history.retention.olderObs"), ">20<", t("history.retention.vehicles"), ">4<", t("history.retention.totalCheckpoints"), t("history.retention.obsolete"), t("history.retention.overlap"), t("history.retention.protected"), t("history.retention.audit"), t("history.retention.boundaryRule"), t("history.retention.candidateRule")] ) assert.ok(html.includes(expected), expected);
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ""), /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.ok(html.includes(t("history.retention.overlapWarning")));
  assert.equal((html.match(/<button/g) ?? []).length, 0);
  assert.equal((html.match(/<input/g) ?? []).length, 0);
  for (const forbidden of ["Удалить", "Очистить", "Запустить retention", "Подтвердить удаление", "enable-retention", "retentionDays", "365 дней"]) assert.equal(html.includes(forbidden), false, forbidden);
});

test("boundary warning is absent when there is no overlap", () => {
  const html = renderToStaticMarkup(<PositionHistoryRetention data={positionHistoryRetentionFixture(0)} />);
  assert.equal(html.includes(t("history.retention.overlapWarning")), false);
  assert.ok(html.includes(t("history.retention.audit")));
});

test("USER never sees destructive controls while ADMIN sees only the explicit fixed-budget action when work exists", () => {
  const userHtml = renderToStaticMarkup(<PositionHistoryRetention data={positionHistoryRetentionFixture()} isAdmin={false} />);
  assert.equal(userHtml.includes(t("history.retention.clean")), false);
  const adminHtml = renderToStaticMarkup(<PositionHistoryRetention data={positionHistoryRetentionFixture()} isAdmin />);
  for (const expected of [t("history.retention.clean"), t("history.retention.manualLimits")]) assert.ok(adminHtml.includes(expected), expected);
  for (const forbidden of ["retentionDays", "365 дней", "checkpointBudget", "observationBudget", "<input"]) assert.equal(adminHtml.includes(forbidden), false, forbidden);
});

test("ADMIN no-work state has no enabled destructive action", () => {
  const fixture = positionHistoryRetentionFixture(0);
  const noWork = { ...fixture, observations: { ...fixture.observations, executableObservationCandidates: 0 }, checkpoints: { ...fixture.checkpoints, fullyObsolete: 0 } };
  const html = renderToStaticMarkup(<PositionHistoryRetention data={noWork} isAdmin />);
  assert.ok(html.includes(t("history.retention.noWork")));
  assert.equal(html.includes(t("history.retention.clean")), false);
});

test("confirmation source discloses snapshot, ordering, protection, irreversibility, limits, cancel, and one non-retried POST", () => {
  const source = readFileSync("src/components/position-history-retention.tsx", "utf8");
  for (const expected of ["history.retention.confirmTitle", "canonicalAnchor", "policyCutoff", "history.retention.confirmWarning", "common.cancel", "history.retention.delete"]) assert.ok(source.includes(expected), expected);
  assert.equal((source.match(/method: "POST"/g) ?? []).length, 1);
  assert.doesNotMatch(source, /retry|setInterval|setTimeout/);
});
