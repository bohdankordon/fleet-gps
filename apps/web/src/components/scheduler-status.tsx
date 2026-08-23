"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SchedulerStatusResponse } from "@/lib/scheduler/scheduler-contract";
import { formatSchedulerInterval, formatSchedulerTimestamp, schedulerFailureCategoryLabel } from "@/lib/scheduler/scheduler-formatters";
import { parseSchedulerRefreshPayload, schedulerInitialErrorLabel, schedulerStateLabel } from "@/lib/scheduler/scheduler-ui-model";
import { useI18n } from "../i18n/client";
import { Alert, Badge, Button, Card } from "./ui";

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
  if (!status) return <Card as="section" variant="subtle" className="dashboard-scheduler dashboard-scheduler--danger" aria-labelledby="scheduler-heading"><SchedulerHeading loading={loading} onRefresh={refresh} /><Alert variant="danger" live="assertive" title={t("scheduler.loadError")} /></Card>;
  return <Card as="section" variant="subtle" className={`dashboard-scheduler dashboard-scheduler--${failed ? "danger" : status.enabled ? "active" : "disabled"}`} aria-labelledby="scheduler-heading">
    <SchedulerHeading loading={loading} onRefresh={refresh} />
    {failed && <Alert variant="danger" live="assertive" title={t("scheduler.loadError")} />}
    {!status.enabled && <Badge variant="neutral" className="dashboard-scheduler__disabled">{t("scheduler.disabled")}</Badge>}
    <div className="dashboard-scheduler__grid">
      <article className="dashboard-scheduler__panel dashboard-scheduler__panel--overview"><h3>{t("scheduler.overall")}</h3><dl><Field label={t("scheduler.state")} value={schedulerStateLabel(status, locale)} /><Field label={t("scheduler.started")} value={formatSchedulerTimestamp(status.startedAt, timezone, locale)} /><Field label={t("scheduler.fleetInterval")} value={formatSchedulerInterval(status.fleetIntervalSeconds, locale)} /><Field label={t("scheduler.distanceInterval")} value={formatSchedulerInterval(status.runsIntervalSeconds, locale)} /><Field label={t("scheduler.generated")} value={formatSchedulerTimestamp(status.generatedAt, timezone, locale)} /></dl></article>
      <JobCard title={t("scheduler.fleetJob")} job={status.fleet} timezone={timezone} />
      <JobCard title={t("scheduler.distanceJob")} job={status.runs} timezone={timezone} />
    </div>
  </Card>;
}

function SchedulerHeading({ loading, onRefresh }: Readonly<{ loading: boolean; onRefresh: () => void }>) {
  const { t } = useI18n();
  return <div className="dashboard-scheduler__heading"><div><p className="dashboard-scheduler__eyebrow">{t("scheduler.eyebrow")}</p><h2 id="scheduler-heading">{t("scheduler.title")}</h2></div><Button type="button" variant="secondary" size="compact" onClick={onRefresh} loading={loading}>{loading ? t("common.refreshing") : t("scheduler.refresh")}</Button></div>;
}

function Field({ label, value }: Readonly<{ label: string; value: string | number }>) { return <div><dt>{label}</dt><dd className="ui-tabular-nums">{value}</dd></div>; }
function JobCard({ title, job, timezone }: Readonly<{ title: string; job: Job; timezone: string }>) {
  const { locale, t } = useI18n();
  return <article className="dashboard-scheduler__panel"><div className="dashboard-scheduler__card-heading"><h3>{title}</h3><Badge variant={job.running ? "info" : "neutral"}>{job.running ? t("scheduler.running") : t("scheduler.idle")}</Badge></div>{job.consecutiveFailures > 0 && <Alert variant="warning" title={t("scheduler.failuresWarning")} />}<dl><Field label={t("scheduler.state")} value={job.running ? t("scheduler.running") : t("scheduler.idle")} /><Field label={t("scheduler.lastAttempt")} value={formatSchedulerTimestamp(job.lastAttemptAt, timezone, locale)} /><Field label={t("scheduler.lastSuccess")} value={formatSchedulerTimestamp(job.lastSuccessAt, timezone, locale)} /><Field label={t("scheduler.lastFailure")} value={formatSchedulerTimestamp(job.lastFailureAt, timezone, locale)} /><Field label={t("scheduler.failureCategory")} value={schedulerFailureCategoryLabel(job.lastFailureCategory, locale)} /><Field label={t("scheduler.consecutiveFailures")} value={job.consecutiveFailures} /><Field label={t("scheduler.successfulRuns")} value={job.successfulRuns} /><Field label={t("scheduler.failedRuns")} value={job.failedRuns} /><Field label={t("scheduler.skippedOverlaps")} value={job.skippedOverlaps} /></dl></article>;
}
