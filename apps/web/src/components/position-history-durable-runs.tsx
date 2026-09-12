import { createTranslator } from "../i18n/core";
import { formatNumber } from "../i18n/formatting";
import { DEFAULT_LOCALE, type AppLocale } from "../i18n/locales";
import type { SafeDurableRun } from "../lib/position-history-durable-runs/position-history-durable-run-contract";

export function durableRunPresentation(run: SafeDurableRun, locale: AppLocale = DEFAULT_LOCALE): Readonly<{ title: string; progress: string; partialWork: boolean }> {
  const t = createTranslator(locale);
  const statusKey = { PENDING: "history.durable.status.pending", RUNNING: "history.durable.status.running", SUCCEEDED: "history.durable.status.succeeded", FAILED: "history.durable.status.failed" } as const;
  return { title: t(statusKey[run.status]), progress: `${formatNumber(locale, run.committedWindows)} / ${formatNumber(locale, run.windowBudget)}`, partialWork: run.status === "FAILED" };
}

export function durableRunInitiatorLabel(initiatorType: SafeDurableRun["initiatorType"], locale: AppLocale = DEFAULT_LOCALE): string {


  const t = createTranslator(locale);
  return t(initiatorType === "SYSTEM" ? "history.durable.automatic" : "history.durable.operator");
}
