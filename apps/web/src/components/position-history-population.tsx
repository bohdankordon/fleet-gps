"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useI18n } from "../i18n/client";
import { formatDateTime, formatNumber } from "../i18n/formatting";
import type { PositionHistoryPopulationResult } from "../lib/position-history-population/position-history-population-contract";
import { executeAndRefreshPositionHistory } from "../lib/position-history-population/position-history-population-interaction";

type Budget = 6 | 12 | 24;
type Props = Readonly<{ anchor: string }>;

export function PositionHistoryPopulation({ anchor }: Props) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [maxWindows, setMaxWindows] = useState<Budget>(24);
  const [excludeProviderDisabled, setExcludeProviderDisabled] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRequest = useRef(false);
  const [result, setResult] = useState<PositionHistoryPopulationResult | null>(null);
  const [failure, setFailure] = useState<"ALREADY_RUNNING" | "FAILED" | null>(null);
  const number = (value: number) => formatNumber(locale, value);
  const displayedAnchor = formatDateTime(locale, anchor) ?? t("common.notAvailable");

  async function execute(): Promise<void> {
    if (pendingRequest.current) return;
    pendingRequest.current = true; setPending(true); setFailure(null); setResult(null);
    try {
      const outcome = await executeAndRefreshPositionHistory({ to: anchor, maxWindows, excludeProviderDisabled });
      if (outcome.kind === "SUCCESS") setResult(outcome.result);
      else setFailure(outcome.kind);
    } finally { router.refresh(); pendingRequest.current = false; setPending(false); setConfirming(false); }
  }

  return <section className="admin-history-section admin-history-population" aria-labelledby="history-population-title">
    <h2 id="history-population-title">{t("history.population.title")}</h2>
    <p>{t("history.population.checkpoint", { anchor: displayedAnchor })}</p>
    <fieldset disabled={pending}><legend>{t("history.population.maxWindows")}</legend><div className="history-budget-options">{([6, 12, 24] as const).map((value) => <label key={value}><input type="radio" name="history-max-windows" value={value} checked={maxWindows === value} onChange={() => setMaxWindows(value)} /> {number(value)}</label>)}</div></fieldset>
    <label className="check"><input type="checkbox" checked={excludeProviderDisabled} disabled={pending} onChange={(event) => setExcludeProviderDisabled(event.target.checked)} /> {t("history.population.skipDisabled")}</label>
    <p className="admin-history-disclaimer">{t("history.backfill.disabledHelp")}</p>
    {!confirming && <button type="button" disabled={pending} onClick={() => setConfirming(true)}>{t("history.population.start")}</button>}
    {confirming && <div className="confirmation" role="dialog" aria-modal="true" aria-labelledby="history-confirmation-title"><p id="history-confirmation-title">{t("history.population.confirmTitle")}</p><dl><div><dt>{t("history.slices.to")}</dt><dd><time dateTime={anchor}>{displayedAnchor}</time></dd></div><div><dt>{t("history.population.maxWindows")}</dt><dd>{number(maxWindows)}</dd></div><div><dt>Provider-disabled</dt><dd>{t(excludeProviderDisabled ? "history.population.willSkip" : "history.population.willInclude")}</dd></div></dl><p>{t("history.population.warning")}</p><button type="button" disabled={pending} onClick={() => setConfirming(false)}>{t("common.cancel")}</button><button type="button" disabled={pending} onClick={() => void execute()}>{pending ? t("history.population.running") : t("history.population.start")}</button></div>}
    {failure === "ALREADY_RUNNING" && <p className="admin-error" role="alert">{t("history.population.already")}</p>}
    {failure === "FAILED" && <p className="admin-error" role="alert">{t("history.population.failed")}</p>}
    {result && <div className="history-population-result" role="status"><h3>{t("history.population.result")}</h3><dl><div><dt>{t("history.population.processed")}</dt><dd>{number(result.committedWindows)}</dd></div><div><dt>{t("history.population.requests")}</dt><dd>{number(result.providerRequests)}</dd></div><div><dt>{t("history.population.rows")}</dt><dd>{number(result.rowsReceived)}</dd></div><div><dt>{t("history.population.candidates")}</dt><dd>{number(result.candidates)}</dd></div><div><dt>{t("history.population.inserted")}</dt><dd>{number(result.inserted)}</dd></div><div><dt>{t("history.population.duplicates")}</dt><dd>{number(result.duplicates)}</dd></div><div><dt>{t("history.population.invalid")}</dt><dd>{number(result.invalid)}</dd></div><div><dt>{t("history.population.retries")}</dt><dd>{number(result.retries)}</dd></div><div><dt>{t("history.population.rateLimits")}</dt><dd>{number(result.rateLimits)}</dd></div><div><dt>{t("history.population.disabledSkipped")}</dt><dd>{number(result.providerDisabledExcluded)}</dd></div><div><dt>{t("history.population.slices")}</dt><dd>{number(result.slicesVisited)}</dd></div><div><dt>{t("history.population.budgetExhausted")}</dt><dd>{t(result.stoppedByBudget ? "common.yes" : "common.no")}</dd></div><div><dt>{t("history.population.horizonComplete")}</dt><dd>{t(result.horizonComplete ? "common.yes" : "common.no")}</dd></div></dl></div>}
  </section>;
}
