"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SchedulerStatusResponse } from "@/lib/scheduler/scheduler-contract";
import { formatSchedulerInterval, formatSchedulerTimestamp, schedulerFailureCategoryLabel } from "@/lib/scheduler/scheduler-formatters";
import { parseSchedulerRefreshPayload, schedulerInitialErrorLabel, schedulerStateLabel } from "@/lib/scheduler/scheduler-ui-model";
import { useI18n } from "../i18n/client";

type Props = Readonly<{ initialStatus: SchedulerStatusResponse | null; timezone: string }>;
type Job = SchedulerStatusResponse["fleet"];

export function SchedulerStatus({ initialStatus, timezone }: Props) {
  const { locale, t } = useI18n();
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(schedulerInitialErrorLabel(initialStatus) !== null);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort; setLoading(true); setFailed(false);
    try {
      const response = await fetch("/api/system/sync-status", { cache: "no-store", signal: abort.signal });
      if (!response.ok) throw new Error();
      const body: unknown = await response.json(); const parsed = parseSchedulerRefreshPayload(body);
      if (!parsed) { if (!abort.signal.aborted) setFailed(true); return; }
      if (!abort.signal.aborted) setStatus(parsed);
    } catch { if (!abort.signal.aborted) setFailed(true); }
    finally { if (!abort.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => () => controller.current?.abort(), []);
  if (!status) return <section className="scheduler-section" aria-labelledby="scheduler-heading"><div className="scheduler-heading"><div><p className="eyebrow">{t("scheduler.eyebrow")}</p><h2 id="scheduler-heading">{t("scheduler.title")}</h2></div><button type="button" onClick={refresh} disabled={loading}>{loading ? t("common.refreshing") : t("scheduler.refresh")}</button></div><p className="scheduler-error" role="alert">{t("scheduler.loadError")}</p></section>;
  return <section className="scheduler-section" aria-labelledby="scheduler-heading">
    <div className="scheduler-heading"><div><p className="eyebrow">{t("scheduler.eyebrow")}</p><h2 id="scheduler-heading">{t("scheduler.title")}</h2></div><button type="button" onClick={refresh} disabled={loading}>{loading ? t("common.refreshing") : t("scheduler.refresh")}</button></div>
    {failed && <p className="scheduler-error" role="alert">{t("scheduler.loadError")}</p>}
    {!status.enabled && <p className="scheduler-disabled">{t("scheduler.disabled")}</p>}
    <div className="scheduler-grid">
      <article className="scheduler-card"><h3>{t("scheduler.overall")}</h3><dl><Field label={t("scheduler.state")} value={schedulerStateLabel(status, locale)} /><Field label={t("scheduler.started")} value={formatSchedulerTimestamp(status.startedAt, timezone, locale)} /><Field label={t("scheduler.fleetInterval")} value={formatSchedulerInterval(status.fleetIntervalSeconds, locale)} /><Field label={t("scheduler.distanceInterval")} value={formatSchedulerInterval(status.runsIntervalSeconds, locale)} /><Field label={t("scheduler.generated")} value={formatSchedulerTimestamp(status.generatedAt, timezone, locale)} /></dl></article>
      <JobCard title={t("scheduler.fleetJob")} job={status.fleet} timezone={timezone} />
      <JobCard title={t("scheduler.distanceJob")} job={status.runs} timezone={timezone} />
    </div>
  </section>;
}

function Field({ label, value }: Readonly<{ label: string; value: string | number }>) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function JobCard({ title, job, timezone }: Readonly<{ title: string; job: Job; timezone: string }>) {
  const { locale, t } = useI18n();
  return <article className="scheduler-card"><h3>{title}</h3>{job.consecutiveFailures > 0 && <p className="scheduler-warning">{t("scheduler.failuresWarning")}</p>}<dl><Field label={t("scheduler.state")} value={job.running ? t("scheduler.running") : t("scheduler.idle")} /><Field label={t("scheduler.lastAttempt")} value={formatSchedulerTimestamp(job.lastAttemptAt, timezone, locale)} /><Field label={t("scheduler.lastSuccess")} value={formatSchedulerTimestamp(job.lastSuccessAt, timezone, locale)} /><Field label={t("scheduler.lastFailure")} value={formatSchedulerTimestamp(job.lastFailureAt, timezone, locale)} /><Field label={t("scheduler.failureCategory")} value={schedulerFailureCategoryLabel(job.lastFailureCategory, locale)} /><Field label={t("scheduler.consecutiveFailures")} value={job.consecutiveFailures} /><Field label={t("scheduler.successfulRuns")} value={job.successfulRuns} /><Field label={t("scheduler.failedRuns")} value={job.failedRuns} /><Field label={t("scheduler.skippedOverlaps")} value={job.skippedOverlaps} /></dl></article>;
}
