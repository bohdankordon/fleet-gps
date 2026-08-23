"use client";

import { useState } from "react";
import { useI18n } from "../i18n/client";
import { createTranslator } from "../i18n/core";
import { formatDateTime, formatNumber, formatUnit } from "../i18n/formatting";
import type { AppLocale } from "../i18n/locales";
import { positionHistoryRetentionExecutionResultSchema, positionHistoryRetentionPlanSchema, type PositionHistoryRetentionExecutionResult, type PositionHistoryRetentionPlan } from "../lib/position-history-retention/position-history-retention-contract";
import { Alert, AlertDialog, Button } from "./ui";

type Props = Readonly<{ data: PositionHistoryRetentionPlan | null; unavailable?: boolean; isAdmin?: boolean }>;

function conflictMessage(code: unknown, locale: AppLocale): string {
  const t = createTranslator(locale);
  if (code === "STALE_PLAN") return t("history.retention.error.stale");
  if (code === "ACTIVE_DURABLE_RUN") return t("history.retention.error.active");
  if (code === "LOCK_UNAVAILABLE") return t("history.retention.error.locked");
  return t("history.retention.error.generic");
}

export function PositionHistoryRetention({ data, unavailable = false, isAdmin = false }: Props) {
  const { locale, t } = useI18n();
  const [plan, setPlan] = useState(data);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PositionHistoryRetentionExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const number = (value: number) => formatNumber(locale, value);
  const instant = (value: string | null) => value === null ? t("history.observations.none") : (formatDateTime(locale, value) ?? t("common.notAvailable"));

  async function refreshPlan(): Promise<void> {
    try {
      const response = await fetch("/api/system/position-history/retention-plan", { cache: "no-store" });
      const parsed = response.ok ? positionHistoryRetentionPlanSchema.safeParse(await response.json()) : null;
      if (parsed?.success) setPlan(parsed.data);
    } catch {}
  }

  async function execute(): Promise<void> {
    if (!plan || busy) return;
    const confirmedSnapshot = { expectedCanonicalAnchor: plan.canonicalAnchor, expectedPolicyCutoff: plan.policyCutoff };
    setBusy(true); setError(null); setResult(null);
    try {
      const response = await fetch("/api/system/position-history/retention-execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(confirmedSnapshot) });
      const body: unknown = await response.json();
      if (!response.ok) {
        const code = typeof body === "object" && body !== null ? (body as Record<string, unknown>).error : null;
        setError(conflictMessage(code, locale));
        if (code === "STALE_PLAN") await refreshPlan();
        return;
      }
      const parsed = positionHistoryRetentionExecutionResultSchema.safeParse(body);
      if (!parsed.success) { setError(conflictMessage(null, locale)); return; }
      setResult(parsed.data); setConfirming(false); await refreshPlan();
    } catch { setError(conflictMessage(null, locale)); }
    finally { setBusy(false); }
  }

  const hasWork = plan !== null && (plan.checkpoints.fullyObsolete > 0 || plan.observations.executableObservationCandidates > 0);
  const setRetentionDialogOpen = (open: boolean) => { setConfirming(open); if (!open) setError(null); };
  return <section className="admin-history-section" aria-labelledby="history-retention-title">
    <h2 id="history-retention-title">{t("history.retention.title")}</h2>
    {unavailable && !plan && <p className="admin-history-disclaimer" role="alert">{t("history.retention.unavailable")}</p>}
    {plan && <>
      <p className="admin-history-disclaimer">{t("history.retention.audit")}</p>
      <div className="admin-history-summary">
        <article><span>{t("history.retention.policy")}</span><strong>{formatUnit(locale, plan.policyDays, "day")}</strong></article>
        <article><span>{t("history.retention.canonical")}</span><strong>{instant(plan.canonicalAnchor)}</strong></article>
        <article><span>{t("history.retention.cutoff")}</span><strong>{instant(plan.policyCutoff)}</strong></article>
        <article><span>{t("history.retention.totalObs")}</span><strong>{number(plan.observations.total)}</strong></article>
        <article><span>{t("history.retention.olderObs")}</span><strong>{number(plan.observations.olderThanPolicyCutoff)}</strong></article>
        <article><span>{t("history.retention.candidates")}</span><strong>{number(plan.observations.executableObservationCandidates)}</strong></article>
        <article><span>{t("history.retention.newerObs")}</span><strong>{number(plan.observations.atOrAfterPolicyCutoff)}</strong></article>
        <article><span>{t("history.retention.vehicles")}</span><strong>{number(plan.observations.vehiclesWithObservationsOlderThanCutoff)}</strong></article>
        <article><span>{t("history.retention.oldest")}</span><strong>{instant(plan.observations.oldestObservedAt)}</strong></article>
        <article><span>{t("history.retention.newest")}</span><strong>{instant(plan.observations.newestObservedAt)}</strong></article>
        <article><span>{t("history.retention.totalCheckpoints")}</span><strong>{number(plan.checkpoints.total)}</strong></article>
        <article><span>{t("history.retention.obsolete")}</span><strong>{number(plan.checkpoints.fullyObsolete)}</strong></article>
        <article><span>{t("history.retention.overlap")}</span><strong>{number(plan.checkpoints.boundaryOverlap)}</strong></article>
        <article><span>{t("history.retention.protected")}</span><strong>{number(plan.checkpoints.protected)}</strong></article>
      </div>
      <p className="admin-history-disclaimer">{t("history.retention.boundaryRule")}</p>
      {plan.safety.hasBoundaryOverlap && <p className="notice" role="status">{t("history.retention.overlapWarning")}</p>}
      <p className="admin-history-disclaimer">{t("history.retention.candidateRule")}</p>

      {isAdmin && <div className="admin-history-destructive">
        {!hasWork && <p className="notice" role="status">{t("history.retention.noWork")}</p>}
        {hasWork && <><p className="admin-history-disclaimer">{t("history.retention.manualLimits")}</p><AlertDialog open={confirming} onOpenChange={setRetentionDialogOpen} trigger={<Button variant="destructive" disabled={busy}>{t("history.retention.clean")}</Button>} title={t("history.retention.confirmTitle")} description={t("history.retention.confirmWarning")} cancelLabel={t("common.cancel")} confirmLabel={busy ? t("history.retention.cleaning") : t("history.retention.delete")} destructive loading={busy} onConfirm={() => void execute()}>
          <div className="ui-dialog__summary"><p>{t("history.retention.canonical")}: <strong>{instant(plan.canonicalAnchor)}</strong></p><p>{t("history.retention.cutoff")}: <strong>{instant(plan.policyCutoff)}</strong></p><p>{t("history.retention.obsoleteCount")}: <strong>{number(plan.checkpoints.fullyObsolete)}</strong></p><p>{t("history.retention.candidateCount")}: <strong>{number(plan.observations.executableObservationCandidates)}</strong></p>{error && <Alert variant="danger" live="assertive" title={error} />}</div>
        </AlertDialog></>}
        {result && <div className="notice" role="status"><p>{t("history.retention.deletedCheckpoints", { count: number(result.deletedCheckpoints) })}</p><p>{t("history.retention.deletedObservations", { count: number(result.deletedObservations) })}</p>{result.stoppedByBudget && <p>{t("history.retention.moreWork")}</p>}</div>}
        {error && !confirming && <p className="admin-error" role="alert">{error}</p>}
      </div>}
    </>}
  </section>;
}
