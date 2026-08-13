"use client";

import { useState } from "react";
import { positionHistoryRetentionExecutionResultSchema, positionHistoryRetentionPlanSchema, type PositionHistoryRetentionExecutionResult, type PositionHistoryRetentionPlan } from "../lib/position-history-retention/position-history-retention-contract";

type Props = Readonly<{ data: PositionHistoryRetentionPlan | null; unavailable?: boolean; isAdmin?: boolean }>;
const emptyTimestamp = "Нет наблюдений";

function conflictMessage(code: unknown): string {
  if (code === "STALE_PLAN") return "План хранения изменился. Проверьте обновлённые данные и подтвердите снова.";
  if (code === "ACTIVE_DURABLE_RUN") return "Сейчас запланировано или выполняется дозаполнение истории. Очистку можно запустить после его завершения.";
  if (code === "LOCK_UNAVAILABLE") return "История GPS сейчас изменяется другой операцией. Повторите попытку позже.";
  return "Не удалось завершить очистку. Обновите план перед следующей попыткой.";
}

export function PositionHistoryRetention({ data, unavailable = false, isAdmin = false }: Props) {
  const [plan, setPlan] = useState(data);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PositionHistoryRetentionExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshPlan(): Promise<void> {
    try {
      const response = await fetch("/api/system/position-history/retention-plan", { cache: "no-store" });
      const parsed = response.ok ? positionHistoryRetentionPlanSchema.safeParse(await response.json()) : null;
      if (parsed?.success) setPlan(parsed.data);
    } catch {}
  }

  async function execute(): Promise<void> {
    if (!plan || busy) return;
    const confirmedSnapshot = { expectedCanonicalAnchor: plan.canonicalAnchor, expectedPolicyCutoff: plan.policyCutoff };
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/system/position-history/retention-execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmedSnapshot),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const code = typeof body === "object" && body !== null ? (body as Record<string, unknown>).error : null;
        setError(conflictMessage(code));
        if (code === "STALE_PLAN") await refreshPlan();
        return;
      }
      const parsed = positionHistoryRetentionExecutionResultSchema.safeParse(body);
      if (!parsed.success) { setError(conflictMessage(null)); return; }
      setResult(parsed.data);
      setConfirming(false);
      await refreshPlan();
    } catch { setError(conflictMessage(null)); }
    finally { setBusy(false); }
  }

  const hasWork = plan !== null && (plan.checkpoints.fullyObsolete > 0 || plan.observations.executableObservationCandidates > 0);
  return <section className="admin-history-section" aria-labelledby="history-retention-title">
    <h2 id="history-retention-title">Хранение истории</h2>
    {unavailable && !plan && <p className="admin-history-disclaimer" role="alert">Не удалось загрузить план хранения. Изменения не выполняются.</p>}
    {plan && <>
      <p className="admin-history-disclaimer">Это независимый серверный аудит политики хранения. Контрольная точка страницы <code>?to=</code> не влияет на него. Изменения не выполняются при просмотре.</p>
      <div className="admin-history-summary">
        <article><span>Политика</span><strong>{plan.policyDays} дней</strong></article>
        <article><span>Каноническая точка</span><strong>{plan.canonicalAnchor}</strong></article>
        <article><span>Граница хранения</span><strong>{plan.policyCutoff}</strong></article>
        <article><span>GPS-наблюдений всего</span><strong>{plan.observations.total}</strong></article>
        <article><span>Старше границы политики</span><strong>{plan.observations.olderThanPolicyCutoff}</strong></article>
        <article><span>Можно удалить после очистки checkpoint’ов</span><strong>{plan.observations.executableObservationCandidates}</strong></article>
        <article><span>На границе или новее</span><strong>{plan.observations.atOrAfterPolicyCutoff}</strong></article>
        <article><span>Затронуто автомобилей</span><strong>{plan.observations.vehiclesWithObservationsOlderThanCutoff}</strong></article>
        <article><span>Самое старое наблюдение</span><strong>{plan.observations.oldestObservedAt ?? emptyTimestamp}</strong></article>
        <article><span>Самое новое наблюдение</span><strong>{plan.observations.newestObservedAt ?? emptyTimestamp}</strong></article>
        <article><span>Checkpoint’ов всего</span><strong>{plan.checkpoints.total}</strong></article>
        <article><span>Полностью старше границы</span><strong>{plan.checkpoints.fullyObsolete}</strong></article>
        <article><span>Пересекают границу</span><strong>{plan.checkpoints.boundaryOverlap}</strong></article>
        <article><span>Защищены</span><strong>{plan.checkpoints.protected}</strong></article>
      </div>
      <p className="admin-history-disclaimer">Диапазоны checkpoint’ов Stage 14 включают обе границы. Наблюдение точно на границе хранения защищено; checkpoint, заканчивающийся точно на границе, считается пересекающим её.</p>
      {plan.safety.hasBoundaryOverlap && <p className="notice" role="status">Некоторые checkpoint-диапазоны пересекают границу хранения. Они и покрытые ими старые наблюдения остаются защищёнными; этот экран ничего не удаляет без отдельного подтверждения ADMIN.</p>}
      <p className="admin-history-disclaimer">Количество наблюдений старше границы — факт политики. Исполняемые кандидаты дополнительно исключают наблюдения, покрытые сохраняемыми checkpoint’ами.</p>

      {isAdmin && <div className="admin-history-destructive">
        {!hasWork && <p className="notice" role="status">Нет данных для очистки.</p>}
        {hasWork && !confirming && <>
          <p className="admin-history-disclaimer">За один ручной запуск удаляется до 5 000 checkpoint’ов и до 25 000 GPS-наблюдений. Автоматического запуска нет.</p>
          <button type="button" className="danger-button" onClick={() => { setConfirming(true); setError(null); }}>Очистить устаревшую историю</button>
        </>}
        {hasWork && confirming && <div className="confirmation" role="alertdialog" aria-modal="true" aria-label="Подтверждение очистки истории">
          <h3>Подтвердите необратимую очистку</h3>
          <p>Каноническая точка: <strong>{plan.canonicalAnchor}</strong></p>
          <p>Граница хранения: <strong>{plan.policyCutoff}</strong></p>
          <p>Полностью устаревших checkpoint’ов: <strong>{plan.checkpoints.fullyObsolete}</strong></p>
          <p>Исполняемых GPS-кандидатов: <strong>{plan.observations.executableObservationCandidates}</strong></p>
          <p>Сначала удаляется checkpoint-истина, затем GPS-наблюдения. Пересекающие границу диапазоны остаются защищёнными. Удаление необратимо; при достижении лимитов 5 000 / 25 000 потребуются последующие отдельные запуски.</p>
          <div className="admin-actions">
            <button type="button" disabled={busy} onClick={() => { setConfirming(false); setError(null); }}>Отмена</button>
            <button type="button" className="danger-button" disabled={busy} onClick={() => void execute()}>{busy ? "Очистка…" : "Удалить устаревшую историю"}</button>
          </div>
        </div>}
        {result && <div className="notice" role="status">
          <p>Удалено checkpoint’ов: {result.deletedCheckpoints}</p>
          <p>Удалено GPS-наблюдений: {result.deletedObservations}</p>
          {result.stoppedByBudget && <p>Осталась допустимая работа. Обновите план и запустите следующую очистку явно.</p>}
        </div>}
        {error && <p className="admin-error" role="alert">{error}</p>}
      </div>}
    </>}
  </section>;
}
