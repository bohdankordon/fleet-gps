"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { readActiveDurableRun, readRecentDurableRuns, submitDurableRun } from "../lib/position-history-durable-runs/position-history-durable-run-browser";
import { durableRunBudgets, type DurableRunBudget, type SafeDurableRun } from "../lib/position-history-durable-runs/position-history-durable-run-contract";
import { startDurableRunPolling } from "../lib/position-history-durable-runs/position-history-durable-run-polling";

type Props = Readonly<{ anchor: string; canPopulate: boolean; initialActive: SafeDurableRun | null; initialRecent: readonly SafeDurableRun[] }>;
const statusText = { PENDING: "Ожидает запуска", RUNNING: "Фоновое дозаполнение выполняется", SUCCEEDED: "Завершено", FAILED: "Остановлено с ошибкой" } as const;

export function durableRunPresentation(run: SafeDurableRun): Readonly<{ title: string; progress: string; partialWork: boolean }> {
  return { title: statusText[run.status], progress: `${run.committedWindows} / ${run.windowBudget}`, partialWork: run.status === "FAILED" };
}

export function durableRunInitiatorLabel(initiatorType: SafeDurableRun["initiatorType"]): "Оператор" | "Автоматически" {
  return initiatorType === "SYSTEM" ? "Автоматически" : "Оператор";
}

function RunSummary({ run }: Readonly<{ run: SafeDurableRun }>) {
  const presentation = durableRunPresentation(run);
  return <article className="history-population-result"><h3>{presentation.title}</h3><p>Инициатор: {durableRunInitiatorLabel(run.initiatorType)}</p><p><strong>{presentation.progress}</strong> часовых окон</p><p>Контрольная точка: {run.to}</p><p>Provider-disabled: {run.excludeProviderDisabled ? "пропускаются" : "не исключаются"}</p>{run.startedAt && <p>Начато: {run.startedAt}</p>}{presentation.partialWork && <p>Часть работы могла быть сохранена. После устранения причины можно создать новый запуск.</p>}</article>;
}

export function PositionHistoryDurableRuns({ anchor, canPopulate, initialActive, initialRecent }: Props) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [recent, setRecent] = useState(initialRecent);
  const [budget, setBudget] = useState<DurableRunBudget>(1000);
  const [excludeProviderDisabled, setExcludeProviderDisabled] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<"ALREADY_RUNNING" | "FAILED" | null>(null);
  const submitting = useRef(false);

  useEffect(() => startDurableRunPolling({ anchor, initialActive, loadActive: readActiveDurableRun, loadRecent: readRecentDurableRuns, onActive: setActive, onRecent: setRecent, refreshHorizon: () => router.refresh() }), [anchor, initialActive, router]);

  async function create(): Promise<void> {
    if (submitting.current) return;
    submitting.current = true; setPending(true); setFailure(null);
    try {
      const outcome = await submitDurableRun({ to: anchor, windowBudget: budget, excludeProviderDisabled });
      if (outcome.kind === "CREATED") setActive(outcome.run);
      else { setFailure(outcome.kind); if (outcome.active) setActive(outcome.active); }
    } finally { submitting.current = false; setPending(false); setConfirming(false); router.refresh(); }
  }

  return <section className="admin-history-section admin-history-population" aria-labelledby="durable-history-title">
    <h2 id="durable-history-title">Фоновое дозаполнение истории</h2>
    {active && <><p>Активный долговременный запуск:</p><RunSummary run={active} /></>}
    {canPopulate && active === null && <>
      <p>Контрольная точка: <strong>{anchor}</strong></p>
      <fieldset disabled={pending}><legend>Максимум часовых окон:</legend><div className="history-budget-options">{durableRunBudgets.map((value) => <label key={value}><input type="radio" name="durable-history-budget" value={value} checked={budget === value} onChange={() => setBudget(value)} /> {value}</label>)}</div></fieldset>
      <label className="check"><input type="checkbox" checked={excludeProviderDisabled} disabled={pending} onChange={(event) => setExcludeProviderDisabled(event.target.checked)} /> Пропустить provider-disabled</label>
      {!confirming && <button type="button" disabled={pending} onClick={() => setConfirming(true)}>Запустить фоновое дозаполнение</button>}
      {confirming && <div className="confirmation" role="dialog" aria-modal="true" aria-labelledby="durable-confirm-title"><h3 id="durable-confirm-title">Подтвердите фоновый запуск</h3><p>Контрольная точка: {anchor}</p><p>Лимит: {budget} часовых окон.</p><p>Provider-disabled: {excludeProviderDisabled ? "будут пропущены" : "не будут исключены"}.</p><p>Операция может выполняться долго и продолжится после закрытия страницы или браузера. Она обращается к GPS-провайдеру и может записывать GPS-наблюдения и чекпоинты истории.</p><button type="button" disabled={pending} onClick={() => setConfirming(false)}>Отмена</button><button type="button" disabled={pending} onClick={() => void create()}>{pending ? "Создание…" : "Запустить"}</button></div>}
    </>}
    {failure === "ALREADY_RUNNING" && <p className="admin-error" role="alert">Фоновое дозаполнение уже запущено.</p>}
    {failure === "FAILED" && <p className="admin-error" role="alert">Не удалось подтвердить создание запуска. Проверен текущий активный статус; автоматическая повторная отправка не выполнялась.</p>}
    <h3>Последние завершённые запуски</h3>
    {recent.length === 0 ? <p>Завершённых запусков пока нет.</p> : <div>{recent.map((run) => <RunSummary key={run.id} run={run} />)}</div>}
  </section>;
}
