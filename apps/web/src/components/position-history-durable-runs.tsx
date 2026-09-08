"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/client";
import { createTranslator } from "../i18n/core";
import { formatDateTime, formatNumber } from "../i18n/formatting";
import { DEFAULT_LOCALE, type AppLocale } from "../i18n/locales";
import { readActiveDurableRun, readRecentDurableRuns, submitDurableRun } from "../lib/position-history-durable-runs/position-history-durable-run-browser";
import { durableRunBudgets, type DurableRunBudget, type SafeDurableRun } from "../lib/position-history-durable-runs/position-history-durable-run-contract";
import { shouldShowDurableCreateControls, startDurableRunPolling } from "../lib/position-history-durable-runs/position-history-durable-run-polling";
import { AlertDialog, Button } from "./ui";

type Props = Readonly<{ anchor: string; canPopulate: boolean; initialActive: SafeDurableRun | null; initialRecent: readonly SafeDurableRun[]; initialActiveUnavailable?: boolean; initialRecentUnavailable?: boolean }>;

export function durableRunPresentation(run: SafeDurableRun, locale: AppLocale = DEFAULT_LOCALE): Readonly<{ title: string; progress: string; partialWork: boolean }> {
  const t = createTranslator(locale);
  const statusKey = { PENDING: "history.durable.status.pending", RUNNING: "history.durable.status.running", SUCCEEDED: "history.durable.status.succeeded", FAILED: "history.durable.status.failed" } as const;
  return { title: t(statusKey[run.status]), progress: `${formatNumber(locale, run.committedWindows)} / ${formatNumber(locale, run.windowBudget)}`, partialWork: run.status === "FAILED" };
}

export function durableRunInitiatorLabel(initiatorType: SafeDurableRun["initiatorType"], locale: AppLocale = DEFAULT_LOCALE): string {


  const t = createTranslator(locale);
  return t(initiatorType === "SYSTEM" ? "history.durable.automatic" : "history.durable.operator");
}




function RunSummary({ run }: Readonly<{ run: SafeDurableRun }>) {
  const { locale, t } = useI18n();
  const presentation = durableRunPresentation(run, locale);
  return <article className="history-population-result"><h3>{presentation.title}</h3><p>{t("history.durable.initiator", { initiator: durableRunInitiatorLabel(run.initiatorType, locale) })}</p><p><strong>{t("history.durable.progress", { progress: presentation.progress })}</strong></p><p>{t("history.population.checkpoint", { anchor: formatDateTime(locale, run.to) ?? t("common.notAvailable") })}</p><p>{t("history.population.providerState", { state: t(run.excludeProviderDisabled ? "history.population.willSkip" : "history.population.willInclude") })}</p>{run.startedAt && <p>{t("history.durable.started", { time: formatDateTime(locale, run.startedAt) ?? t("common.notAvailable") })}</p>}{presentation.partialWork && <p>{t("history.durable.partial")}</p>}</article>;
}

export function PositionHistoryDurableRuns({ anchor, canPopulate, initialActive, initialRecent, initialActiveUnavailable = false, initialRecentUnavailable = false }: Props) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [active, setActive] = useState(initialActive);
  const [recent, setRecent] = useState(initialRecent);
  // Truthful read-state: SUCCESS + NONE vs READ FAILURE are distinct.
  // Preserve last-known data on poll failure; surface unavailable separately.
  const [activeUnavailable, setActiveUnavailable] = useState(initialActiveUnavailable);
  const [recentUnavailable, setRecentUnavailable] = useState(initialRecentUnavailable);
  const [budget, setBudget] = useState<DurableRunBudget>(1000);
  const [excludeProviderDisabled, setExcludeProviderDisabled] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<"ALREADY_RUNNING" | "FAILED" | null>(null);
  const submitting = useRef(false);  const recentUnavailableRef = useRef(initialRecentUnavailable);  const activeEpochRef = useRef(0);
  const displayedAnchor = formatDateTime(locale, anchor) ?? t("common.notAvailable");

  useEffect(
    () =>
      startDurableRunPolling({
        anchor,
        initialActive,
        loadActive: readActiveDurableRun,
        loadRecent: readRecentDurableRuns,
        onActive: (value) => {
          setActive(value);
          setActiveUnavailable(false);
        },
        onRecent: (value) => {
          setRecent(value);
          setRecentUnavailable(false); recentUnavailableRef.current = false;
        },
        onActiveError: () => setActiveUnavailable(true),
        onRecentError: () => { setRecentUnavailable(true); recentUnavailableRef.current = true; },
        isRecentUnavailable: () => recentUnavailableRef.current,        getActiveEpoch: () => activeEpochRef.current,        refreshHorizon: () => router.refresh(),
      }),
    [anchor, initialActive, router],
  );

  async function create(): Promise<void> {
    if (submitting.current) return;
    submitting.current = true; setPending(true); setFailure(null); activeEpochRef.current += 1;
    try {
      const outcome = await submitDurableRun({ to: anchor, windowBudget: budget, excludeProviderDisabled }); activeEpochRef.current += 1;
      if (outcome.kind === "CREATED") { setActive(outcome.run); setActiveUnavailable(false); }
      else { setFailure(outcome.kind); if (outcome.activeUnavailable) { setActiveUnavailable(true); if (outcome.active) setActive(outcome.active); } else { setActiveUnavailable(false); setActive(outcome.active); } }
    } finally { submitting.current = false; setPending(false); setConfirming(false); router.refresh(); }
  }

  return <section className="admin-history-section admin-history-population" aria-labelledby="durable-history-title">
    <h2 id="durable-history-title">{t("history.durable.title")}</h2>
    {active && <><p>{t("history.durable.active")}</p><RunSummary run={active} /></>}
    {activeUnavailable && <p className="admin-error" role="alert">{t("history.durable.activeUnavailable")}</p>}
    {shouldShowDurableCreateControls(active, activeUnavailable, canPopulate) && <>
      <p>{t("history.population.checkpoint", { anchor: displayedAnchor })}</p>
      <fieldset disabled={pending}><legend>{t("history.population.maxWindows")}</legend><div className="history-budget-options">{durableRunBudgets.map((value) => <label key={value}><input type="radio" name="durable-history-budget" value={value} checked={budget === value} onChange={() => setBudget(value)} /> {formatNumber(locale, value)}</label>)}</div></fieldset>
      <label className="check"><input type="checkbox" checked={excludeProviderDisabled} disabled={pending} onChange={(event) => setExcludeProviderDisabled(event.target.checked)} /> {t("history.population.skipDisabled")}</label>
      <AlertDialog open={confirming} onOpenChange={setConfirming} trigger={<Button disabled={pending}>{t("history.durable.start")}</Button>} title={t("history.durable.confirmTitle")} description={t("history.durable.warning")} cancelLabel={t("common.cancel")} confirmLabel={pending ? t("history.durable.creating") : t("history.durable.start")} loading={pending} onConfirm={() => void create()}>
        <div className="ui-dialog__summary"><p>{t("history.population.checkpoint", { anchor: displayedAnchor })}</p><p>{t("history.population.limit", { windows: formatNumber(locale, budget) })}</p><p>{t("history.population.providerState", { state: t(excludeProviderDisabled ? "history.population.willSkip" : "history.population.willInclude") })}</p></div>
      </AlertDialog>
    </>}
    {failure === "ALREADY_RUNNING" && <p className="admin-error" role="alert">{t("history.durable.already")}</p>}
    {failure === "FAILED" && <p className="admin-error" role="alert">{t("history.durable.failed")}</p>}
    <h3>{t("history.durable.recent")}</h3>
    {recentUnavailable && <p className="admin-error" role="alert">{t("history.durable.recentUnavailable")}</p>}
    {recent.length === 0 ? (!recentUnavailable ? <p>{t("history.durable.none")}</p> : null) : <div>{recent.map((run) => <RunSummary key={run.id} run={run} />)}</div>}
  </section>;
}
