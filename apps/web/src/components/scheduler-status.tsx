"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SchedulerStatusResponse } from "@/lib/scheduler/scheduler-contract";
import { formatSchedulerInterval, formatSchedulerTimestamp, schedulerFailureCategoryLabel } from "@/lib/scheduler/scheduler-formatters";
import { parseSchedulerRefreshPayload, schedulerInitialErrorLabel, schedulerStateLabel } from "@/lib/scheduler/scheduler-ui-model";

type Props = Readonly<{ initialStatus: SchedulerStatusResponse | null; timezone: string }>;
type Job = SchedulerStatusResponse["fleet"];

export function SchedulerStatus({ initialStatus, timezone }: Props) {
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
  if (!status) return <section className="scheduler-section" aria-labelledby="scheduler-heading"><div className="scheduler-heading"><div><p className="eyebrow">Состояние scheduler</p><h2 id="scheduler-heading">Автоматическое обновление</h2></div><button type="button" onClick={refresh} disabled={loading}>{loading ? "Обновление…" : "Обновить состояние"}</button></div><p className="scheduler-error" role="alert">Не удалось загрузить состояние обновления.</p></section>;
  return <section className="scheduler-section" aria-labelledby="scheduler-heading">
    <div className="scheduler-heading"><div><p className="eyebrow">Состояние scheduler</p><h2 id="scheduler-heading">Автоматическое обновление</h2></div><button type="button" onClick={refresh} disabled={loading}>{loading ? "Обновление…" : "Обновить состояние"}</button></div>
    {failed && <p className="scheduler-error" role="alert">Не удалось загрузить состояние обновления.</p>}
    {!status.enabled && <p className="scheduler-disabled">Автоматическое обновление отключено</p>}
    <div className="scheduler-grid">
      <article className="scheduler-card"><h3>Общий статус</h3><dl><Field label="Состояние" value={schedulerStateLabel(status)} /><Field label="Запущен" value={formatSchedulerTimestamp(status.startedAt, timezone)} /><Field label="Интервал машин" value={formatSchedulerInterval(status.fleetIntervalSeconds)} /><Field label="Интервал пробега" value={formatSchedulerInterval(status.runsIntervalSeconds)} /><Field label="Статус сформирован" value={formatSchedulerTimestamp(status.generatedAt, timezone)} /></dl></article>
      <JobCard title="Машины и позиции" job={status.fleet} timezone={timezone} />
      <JobCard title="Дневной пробег" job={status.runs} timezone={timezone} />
    </div>
  </section>;
}

function Field({ label, value }: Readonly<{ label: string; value: string | number }>) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function JobCard({ title, job, timezone }: Readonly<{ title: string; job: Job; timezone: string }>) {
  return <article className="scheduler-card"><h3>{title}</h3>{job.consecutiveFailures > 0 && <p className="scheduler-warning">Есть последовательные неудачные обновления</p>}<dl><Field label="Состояние" value={job.running ? "Выполняется" : "Ожидание"} /><Field label="Последняя попытка" value={formatSchedulerTimestamp(job.lastAttemptAt, timezone)} /><Field label="Последний успех" value={formatSchedulerTimestamp(job.lastSuccessAt, timezone)} /><Field label="Последняя ошибка" value={formatSchedulerTimestamp(job.lastFailureAt, timezone)} /><Field label="Категория ошибки" value={schedulerFailureCategoryLabel(job.lastFailureCategory)} /><Field label="Последовательных ошибок" value={job.consecutiveFailures} /><Field label="Успешных запусков" value={job.successfulRuns} /><Field label="Неудачных запусков" value={job.failedRuns} /><Field label="Пропущено пересечений" value={job.skippedOverlaps} /></dl></article>;
}
