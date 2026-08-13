"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { PositionHistoryPopulationResult } from "../lib/position-history-population/position-history-population-contract";
import { executeAndRefreshPositionHistory } from "../lib/position-history-population/position-history-population-interaction";

type Budget = 6 | 12 | 24;
type Props = Readonly<{ anchor: string }>;

export function PositionHistoryPopulation({ anchor }: Props) {
  const router = useRouter();
  const [maxWindows, setMaxWindows] = useState<Budget>(24);
  const [excludeProviderDisabled, setExcludeProviderDisabled] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRequest = useRef(false);
  const [result, setResult] = useState<PositionHistoryPopulationResult | null>(null);
  const [failure, setFailure] = useState<"ALREADY_RUNNING" | "FAILED" | null>(null);
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
    <h2 id="history-population-title">Дозаполнение истории</h2>
    <p>Контрольная точка: <strong>{anchor}</strong></p>
    <fieldset disabled={pending}><legend>Максимум часовых окон:</legend><div className="history-budget-options">{([6, 12, 24] as const).map((value) => <label key={value}><input type="radio" name="history-max-windows" value={value} checked={maxWindows === value} onChange={() => setMaxWindows(value)} /> {value}</label>)}</div></fieldset>
    <label className="check"><input type="checkbox" checked={excludeProviderDisabled} disabled={pending} onChange={(event) => setExcludeProviderDisabled(event.target.checked)} /> Пропустить provider-disabled</label>
    <p className="admin-history-disclaimer">Provider-disabled — техническое сохранённое состояние провайдера, а не бизнес-статус машины.</p>
    {!confirming && <button type="button" disabled={pending} onClick={() => setConfirming(true)}>Дозаполнить историю</button>}
    {confirming && <div className="confirmation" role="dialog" aria-modal="true" aria-labelledby="history-confirmation-title"><p id="history-confirmation-title">Подтвердите запуск</p><dl><div><dt>Контрольная точка</dt><dd>{anchor}</dd></div><div><dt>Максимум часовых окон</dt><dd>{maxWindows}</dd></div><div><dt>Provider-disabled</dt><dd>{excludeProviderDisabled ? "будут пропущены" : "не будут исключены"}</dd></div></dl><p>Операция свяжется с GPS-провайдером и может записать GPS-наблюдения и чекпоинты.</p><button type="button" disabled={pending} onClick={() => setConfirming(false)}>Отмена</button><button type="button" disabled={pending} onClick={() => void execute()}>{pending ? "Выполняется…" : "Запустить"}</button></div>}
    {failure === "ALREADY_RUNNING" && <p className="admin-error" role="alert">Дозаполнение истории уже выполняется.</p>}
    {failure === "FAILED" && <div className="admin-error" role="alert"><strong>Дозаполнение остановлено с ошибкой.</strong><p>Часть работы могла быть сохранена. Статус истории обновлён.</p></div>}
    {result && <div className="history-population-result" role="status"><h3>Дозаполнение завершено</h3><dl><div><dt>Обработано окон</dt><dd>{result.committedWindows}</dd></div><div><dt>Запросов к провайдеру</dt><dd>{result.providerRequests}</dd></div><div><dt>Получено строк</dt><dd>{result.rowsReceived}</dd></div><div><dt>Кандидатов</dt><dd>{result.candidates}</dd></div><div><dt>Добавлено наблюдений</dt><dd>{result.inserted}</dd></div><div><dt>Дубликатов</dt><dd>{result.duplicates}</dd></div><div><dt>Некорректных строк</dt><dd>{result.invalid}</dd></div><div><dt>Повторных попыток</dt><dd>{result.retries}</dd></div><div><dt>Rate limits</dt><dd>{result.rateLimits}</dd></div><div><dt>Пропущено provider-disabled</dt><dd>{result.providerDisabledExcluded}</dd></div><div><dt>Посещено диапазонов</dt><dd>{result.slicesVisited}</dd></div><div><dt>Лимит исчерпан</dt><dd>{result.stoppedByBudget ? "Да" : "Нет"}</dd></div><div><dt>Горизонт завершён</dt><dd>{result.horizonComplete ? "Да" : "Нет"}</dd></div></dl></div>}
  </section>;
}
