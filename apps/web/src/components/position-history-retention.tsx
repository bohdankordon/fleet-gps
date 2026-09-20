"use client";

import { useState } from "react";
import { Descriptions, Typography } from "antd";
import { useI18n } from "../i18n/client";
import { formatDateTime, formatNumber, formatUnit } from "../i18n/formatting";
import { positionHistoryRetentionExecutionResultSchema, positionHistoryRetentionPlanSchema, type PositionHistoryRetentionExecutionResult, type PositionHistoryRetentionPlan } from "../lib/position-history-retention/position-history-retention-contract";
import { Alert, AlertDialog, Button, ErrorState, LoadingStatus } from "./ui";

type Props = Readonly<{ data: PositionHistoryRetentionPlan | null; unavailable?: boolean; isAdmin?: boolean }>;
type FailureCode = "STALE_PLAN" | "ACTIVE_DURABLE_RUN" | "LOCK_UNAVAILABLE" | "PARTIAL_UNKNOWN";

const failureKeys = { STALE_PLAN: "history.retention.error.stale", ACTIVE_DURABLE_RUN: "history.retention.error.active", LOCK_UNAVAILABLE: "history.retention.error.locked", PARTIAL_UNKNOWN: "history.retention.error.partial" } as const;

function TimeValue({ value }: Readonly<{ value: string | null }>) {
  const { locale, t } = useI18n();
  if (value === null) return <>{t("common.notAvailable")}</>;
  return <time dateTime={value}>{formatDateTime(locale, value) ?? t("common.notAvailable")}</time>;
}

export function PositionHistoryRetention({ data, unavailable = false, isAdmin = false }: Props) {
  const { locale, t } = useI18n();
  const [plan, setPlan] = useState(data);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [result, setResult] = useState<PositionHistoryRetentionExecutionResult | null>(null);
  const [failure, setFailure] = useState<FailureCode | null>(null);
  const number = (value: number) => formatNumber(locale, value);
  const breakdown = (counts: Readonly<{ pending: number; running: number; completed: number }>) => `${t("history.retention.status.pending")} ${number(counts.pending)}, ${t("history.retention.status.running")} ${number(counts.running)}, ${t("history.retention.status.completed")} ${number(counts.completed)}`;

  async function refreshPlan(): Promise<boolean> {
    setRefreshing(true);
    try {
      const response = await fetch("/api/system/position-history/retention-plan", { cache: "no-store" });
      const parsed = response.ok ? positionHistoryRetentionPlanSchema.safeParse(await response.json()) : null;
      if (parsed?.success) { setPlan(parsed.data); setRefreshFailed(false); return true; }
      setRefreshFailed(true);
      return false;
    } catch {
      setRefreshFailed(true);
      return false;
    } finally {
      setRefreshing(false);
    }
  }

  async function execute(): Promise<void> {
    if (!plan || busy) return;
    const confirmedSnapshot = { expectedCanonicalAnchor: plan.canonicalAnchor, expectedPolicyCutoff: plan.policyCutoff };
    setBusy(true); setFailure(null); setResult(null);
    try {
      const response = await fetch("/api/system/position-history/retention-execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(confirmedSnapshot) });
      const body: unknown = await response.json();
      setConfirming(false);
      if (!response.ok) {
        const code = typeof body === "object" && body !== null ? (body as Record<string, unknown>).error : null;
        await refreshPlan();
        setFailure(code === "STALE_PLAN" ? "STALE_PLAN" : code === "ACTIVE_DURABLE_RUN" ? "ACTIVE_DURABLE_RUN" : code === "LOCK_UNAVAILABLE" ? "LOCK_UNAVAILABLE" : "PARTIAL_UNKNOWN");
        return;
      }
      const parsed = positionHistoryRetentionExecutionResultSchema.safeParse(body);
      if (!parsed.success) { await refreshPlan(); setFailure("PARTIAL_UNKNOWN"); return; }
      setResult(parsed.data);
      setConfirming(false);
      await refreshPlan();
    } catch { setConfirming(false); await refreshPlan(); setFailure("PARTIAL_UNKNOWN"); }
    finally { setBusy(false); }
  }

  const hasWork = plan !== null && (plan.policyReconciliation.cursorFloorCandidates > 0
    || plan.policyReconciliation.replayCheckpointCandidates > 0
    || plan.checkpoints.fullyObsolete > 0
    || plan.observations.hasExecutableWork);
  const setRetentionDialogOpen = (open: boolean) => { setConfirming(open); if (!open) setFailure(null); };
  if (!plan) {
    return <div className="history-retention-workspace">
      <Typography.Title level={2} id="history-retention-title">{t("history.retention.title")}</Typography.Title>
      {unavailable && !refreshing
        ? <ErrorState title={t("history.retention.unavailable")} action={<Button variant="secondary" onClick={() => void refreshPlan()}>{t("common.retry")}</Button>} />
        : <LoadingStatus title={t("common.refreshing")} />}
    </div>;
  }

  return <div className="history-retention-workspace">
    <Typography.Title level={2} id="history-retention-title">{t("history.retention.title")}</Typography.Title>
    <section aria-labelledby="history-retention-snapshot-title">
      <Typography.Title level={3} id="history-retention-snapshot-title">{t("history.retention.snapshotTitle")}</Typography.Title>
      <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }} colon={false}>
        <Descriptions.Item label={t("history.retention.policy")}>{formatUnit(locale, plan.policyDays, "day")}</Descriptions.Item>
        <Descriptions.Item label={t("history.retention.canonical")}><TimeValue value={plan.canonicalAnchor} /></Descriptions.Item>
        <Descriptions.Item label={t("history.retention.cutoff")}><TimeValue value={plan.policyCutoff} /></Descriptions.Item>
      </Descriptions>
      <Typography.Paragraph type="secondary">{t("history.retention.audit")}</Typography.Paragraph>
    </section>

    {refreshFailed && <Alert variant="warning" title={t("history.retention.refreshFailed")} action={<Button variant="secondary" size="compact" onClick={() => void refreshPlan()}>{t("common.refresh")}</Button>} />}
    <div className="history-retention-impact">
      <section aria-labelledby="history-retention-delete-title">
        <Typography.Title level={3} id="history-retention-delete-title">{t("history.retention.deleteTitle")}</Typography.Title>
        <Descriptions className="history-retention-facts" bordered size="small" column={1} colon={false}>
          <Descriptions.Item label={t("history.retention.obsolete")}>{number(plan.checkpoints.fullyObsolete)} <Typography.Text type="secondary">({breakdown(plan.checkpoints.fullyObsoleteByStatus)})</Typography.Text></Descriptions.Item>
          <Descriptions.Item label={t("history.retention.observationWork")}>{t(plan.observations.hasExecutableWork ? "common.yes" : "common.no")}</Descriptions.Item>
          <Descriptions.Item label={t("history.retention.cursorFloorCandidates")}>{number(plan.policyReconciliation.cursorFloorCandidates)}</Descriptions.Item>
          <Descriptions.Item label={t("history.retention.replayFloorCandidates")}>{number(plan.policyReconciliation.replayCheckpointCandidates)}</Descriptions.Item>
          <Descriptions.Item label={t("history.retention.oldest")}><TimeValue value={plan.observations.oldestObservedAt} /></Descriptions.Item>
          <Descriptions.Item label={t("history.retention.newest")}><TimeValue value={plan.observations.newestObservedAt} /></Descriptions.Item>
        </Descriptions>
      </section>
      <section aria-labelledby="history-retention-protected-title">
        <Typography.Title level={3} id="history-retention-protected-title">{t("history.retention.protectedTitle")}</Typography.Title>
        <Descriptions className="history-retention-facts" bordered size="small" column={1} colon={false}>
          <Descriptions.Item label={t("history.retention.checkpointTotal")}>{number(plan.checkpoints.total)}</Descriptions.Item>
          <Descriptions.Item label={t("history.retention.overlap")}>{number(plan.checkpoints.boundaryOverlap)} <Typography.Text type="secondary">({breakdown(plan.checkpoints.boundaryOverlapByStatus)})</Typography.Text></Descriptions.Item>
          <Descriptions.Item label={t("history.retention.protected")}>{number(plan.checkpoints.protected)} <Typography.Text type="secondary">({breakdown(plan.checkpoints.protectedByStatus)})</Typography.Text></Descriptions.Item>
        </Descriptions>
      </section>
    </div>

    <section aria-labelledby="history-retention-method-title">
      <Typography.Title level={3} id="history-retention-method-title">{t("history.retention.methodTitle")}</Typography.Title>
      <Typography.Paragraph type="secondary">{t("history.retention.boundaryRule")}</Typography.Paragraph>
      <Typography.Paragraph type="secondary">{t("history.retention.candidateRule")}</Typography.Paragraph>
      {plan.checkpoints.boundaryOverlap > 0 && <Alert variant="warning" title={t("history.retention.overlapWarning")} />}
      <Typography.Paragraph type="secondary">{t("history.retention.manualLimits")}</Typography.Paragraph>
    </section>

    {isAdmin && <section className="history-retention-execution" aria-labelledby="history-retention-execute-title" aria-busy={busy || refreshing}>
      <Typography.Title level={3} id="history-retention-execute-title">{t("history.retention.executeTitle")}</Typography.Title>
      {refreshing && <LoadingStatus title={t("common.refreshing")} />}
      {result && <Alert variant="success" title={t("history.retention.resultTitle")}>
        <p>{t("history.retention.deletedCheckpoints", { count: number(result.deletedCheckpoints) })}</p>
        <p>{t("history.retention.deletedObservations", { count: number(result.deletedObservations) })}</p>
        <p>{t("history.retention.advancedCursorFloors", { count: number(result.advancedCursorFloors) })}</p>
        <p>{t("history.retention.advancedReplayCheckpoints", { count: number(result.advancedReplayCheckpoints), completed: number(result.completedReplayCheckpoints) })}</p>
        <p>{t("history.retention.moreCheckpointWork", { value: t(result.moreCheckpointWork ? "common.yes" : "common.no") })}</p>
        <p>{result.moreObservationWork === null ? t("history.retention.observationWorkDeferred") : t("history.retention.moreObservationWork", { value: t(result.moreObservationWork ? "common.yes" : "common.no") })}</p>
        <p>{t("history.retention.stoppedByBudget", { value: t(result.stoppedByBudget ? "common.yes" : "common.no") })}</p>
        {result.noWork
          ? <p>{t("history.retention.resultNoWork")}</p>
          : (result.stoppedByBudget || result.moreCheckpointWork || result.moreObservationWork) && <p>{t("history.retention.moreWork")}</p>}
      </Alert>}
      {failure && <Alert variant="danger" live="assertive" title={t(failureKeys[failure])} action={<Button variant="secondary" size="compact" onClick={() => void refreshPlan()}>{t("common.refresh")}</Button>} />}
      {!hasWork && <Alert variant="info" title={t("history.retention.noWork")} />}
      {hasWork && <div className="history-retention-danger">
        <AlertDialog open={confirming} onOpenChange={setRetentionDialogOpen} trigger={<Button className="history-retention-danger__action" variant="destructive" disabled={busy || refreshing}>{t("history.retention.clean")}</Button>} title={t("history.retention.confirmTitle")} description={t("history.retention.confirmWarning")} cancelLabel={t("common.cancel")} confirmLabel={busy ? t("history.retention.cleaning") : t("history.retention.delete")} destructive loading={busy} onConfirm={() => void execute()}>
          <dl className="ui-dialog__metadata">
            <div><dt>{t("history.retention.canonical")}</dt><dd><time dateTime={plan.canonicalAnchor}>{formatDateTime(locale, plan.canonicalAnchor) ?? t("common.notAvailable")}</time></dd></div>
            <div><dt>{t("history.retention.cutoff")}</dt><dd><time dateTime={plan.policyCutoff}>{formatDateTime(locale, plan.policyCutoff) ?? t("common.notAvailable")}</time></dd></div>
            <div><dt>{t("history.retention.checkpointBudget")}</dt><dd>{number(5_000)}</dd></div>
            <div><dt>{t("history.retention.observationBudget")}</dt><dd>{number(25_000)}</dd></div>
          </dl>
        </AlertDialog>
      </div>}
    </section>}
  </div>;
}
