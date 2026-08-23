"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { SchedulerStatusResponse } from "@/lib/scheduler/scheduler-contract";
import { formatSchedulerInterval, formatSchedulerTimestamp, schedulerFailureCategoryLabel } from "@/lib/scheduler/scheduler-formatters";
import { parseSchedulerRefreshPayload, schedulerInitialErrorLabel, schedulerStateLabel } from "@/lib/scheduler/scheduler-ui-model";
import { useI18n } from "../i18n/client";
import { ClockIcon, FleetIcon, RouteIcon, type IconProps } from "./ui/icons";
import { Alert, Badge, Button, Card } from "./ui";

type Props = Readonly<{ initialStatus: SchedulerStatusResponse | null; timezone: string }>;
type Job = SchedulerStatusResponse["fleet"];
type SchedulerBadgeVariant = "neutral" | "info" | "warning" | "danger";

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
  const overallVariant: SchedulerBadgeVariant = failed ? "danger" : status.enabled ? "info" : "neutral";
  return <Card as="section" variant="subtle" className={`dashboard-scheduler dashboard-scheduler--${failed ? "danger" : status.enabled ? "active" : "disabled"}`} aria-labelledby="scheduler-heading">
    <SchedulerHeading loading={loading} onRefresh={refresh} state={schedulerStateLabel(status, locale)} stateVariant={overallVariant} />
    {failed && <Alert variant="danger" live="assertive" title={t("scheduler.loadError")} />}
    <div className="dashboard-scheduler__grid">
      <article className="dashboard-scheduler__panel dashboard-scheduler__panel--overview"><SectionHeading icon={ClockIcon} title={t("scheduler.overall")} /><MetadataGroups><MetadataGroup><Field label={t("scheduler.started")} value={formatSchedulerTimestamp(status.startedAt, timezone, locale)} emphasis stacked /></MetadataGroup><MetadataGroup><Field label={t("scheduler.fleetInterval")} value={formatSchedulerInterval(status.fleetIntervalSeconds, locale)} /><Field label={t("scheduler.distanceInterval")} value={formatSchedulerInterval(status.runsIntervalSeconds, locale)} /></MetadataGroup><MetadataGroup wide><Field label={t("scheduler.generated")} value={formatSchedulerTimestamp(status.generatedAt, timezone, locale)} stacked /></MetadataGroup></MetadataGroups></article>
      <JobCard icon={FleetIcon} title={t("scheduler.fleetJob")} job={status.fleet} timezone={timezone} />
      <JobCard icon={RouteIcon} title={t("scheduler.distanceJob")} job={status.runs} timezone={timezone} />
    </div>
  </Card>;
}

function SchedulerHeading({ loading, onRefresh, state, stateVariant }: Readonly<{ loading: boolean; onRefresh: () => void; state?: string; stateVariant?: SchedulerBadgeVariant }>) {
  const { t } = useI18n();
  return <div className="dashboard-scheduler__heading"><div><p className="dashboard-scheduler__eyebrow">{t("scheduler.eyebrow")}</p><div className="dashboard-scheduler__title-row"><ClockIcon size={20} /><h2 id="scheduler-heading">{t("scheduler.title")}</h2></div>{state && stateVariant && <Badge variant={stateVariant} className="dashboard-scheduler__overall-state"><span className="sr-only">{t("scheduler.state")}: </span>{state}</Badge>}</div><Button type="button" variant="secondary" size="compact" onClick={onRefresh} loading={loading}>{loading ? t("common.refreshing") : t("scheduler.refresh")}</Button></div>;
}

function MetadataGroups({ children }: Readonly<{ children: ReactNode }>) { return <div className="dashboard-scheduler__metadata-groups">{children}</div>; }
function MetadataGroup({ children, wide = false, counters = false }: Readonly<{ children: ReactNode; wide?: boolean; counters?: boolean }>) { return <dl className={["dashboard-scheduler__metadata-group", wide ? "dashboard-scheduler__metadata-group--wide" : "", counters ? "dashboard-scheduler__metadata-group--counters" : ""].filter(Boolean).join(" ")}>{children}</dl>; }
function Field({ label, value, emphasis = false, stacked = false }: Readonly<{ label: string; value: string | number; emphasis?: boolean; stacked?: boolean }>) { return <div className={["dashboard-scheduler__field", emphasis ? "dashboard-scheduler__field--primary" : "", stacked ? "dashboard-scheduler__field--stacked" : ""].filter(Boolean).join(" ")}><dt>{label}</dt><dd className="ui-tabular-nums">{value}</dd></div>; }
function SectionHeading({ icon: Icon, title, badge }: Readonly<{ icon: (props: IconProps) => ReactNode; title: string; badge?: ReactNode }>) { return <div className="dashboard-scheduler__card-heading"><div className="dashboard-scheduler__section-title"><Icon size={16} /><h3>{title}</h3></div>{badge}</div>; }
function JobCard({ icon, title, job, timezone }: Readonly<{ icon: (props: IconProps) => ReactNode; title: string; job: Job; timezone: string }>) {
  const { locale, t } = useI18n();
  const stateVariant: SchedulerBadgeVariant = job.consecutiveFailures > 0 ? "warning" : job.running ? "info" : "neutral";
  const panelTone = job.consecutiveFailures > 0 ? "warning" : job.running ? "info" : "neutral";
  const state = job.running ? t("scheduler.running") : t("scheduler.idle");
  return <article className={`dashboard-scheduler__panel dashboard-scheduler__panel--${panelTone}`}><SectionHeading icon={icon} title={title} badge={<Badge variant={stateVariant}><span className="sr-only">{t("scheduler.state")}: </span>{state}</Badge>} />{job.consecutiveFailures > 0 && <Alert variant="warning" title={t("scheduler.failuresWarning")} />}<MetadataGroups><MetadataGroup><Field label={t("scheduler.lastAttempt")} value={formatSchedulerTimestamp(job.lastAttemptAt, timezone, locale)} stacked /><Field label={t("scheduler.lastSuccess")} value={formatSchedulerTimestamp(job.lastSuccessAt, timezone, locale)} emphasis stacked /></MetadataGroup><MetadataGroup><Field label={t("scheduler.lastFailure")} value={formatSchedulerTimestamp(job.lastFailureAt, timezone, locale)} emphasis stacked /><Field label={t("scheduler.failureCategory")} value={schedulerFailureCategoryLabel(job.lastFailureCategory, locale)} stacked /></MetadataGroup><MetadataGroup counters><Field label={t("scheduler.consecutiveFailures")} value={job.consecutiveFailures} emphasis={job.consecutiveFailures > 0} /><Field label={t("scheduler.successfulRuns")} value={job.successfulRuns} /><Field label={t("scheduler.failedRuns")} value={job.failedRuns} emphasis={job.failedRuns > 0} /><Field label={t("scheduler.skippedOverlaps")} value={job.skippedOverlaps} /></MetadataGroup></MetadataGroups></article>;
}
