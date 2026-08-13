import type { PositionHistoryRetentionPlan } from "@/lib/position-history-retention/position-history-retention-contract";

type Props = Readonly<{ data: PositionHistoryRetentionPlan | null; unavailable?: boolean }>;
const emptyTimestamp = "Нет наблюдений";

export function PositionHistoryRetention({ data, unavailable = false }: Props) {
  return <section className="admin-history-section" aria-labelledby="history-retention-title">
    <h2 id="history-retention-title">Хранение истории</h2>
    {unavailable && <p className="admin-history-disclaimer" role="alert">Не удалось загрузить план хранения. Изменения не выполняются.</p>}
    {data && <>
      <p className="admin-history-disclaimer">Это независимый серверный аудит политики хранения. Контрольная точка страницы <code>?to=</code> не влияет на него. Изменения не выполняются.</p>
      <div className="admin-history-summary">
        <article><span>Политика</span><strong>{data.policyDays} дней</strong></article>
        <article><span>Каноническая точка</span><strong>{data.canonicalAnchor}</strong></article>
        <article><span>Граница хранения</span><strong>{data.policyCutoff}</strong></article>
        <article><span>GPS-наблюдений всего</span><strong>{data.observations.total}</strong></article>
        <article><span>Старше границы политики</span><strong>{data.observations.olderThanPolicyCutoff}</strong></article>
        <article><span>На границе или новее</span><strong>{data.observations.atOrAfterPolicyCutoff}</strong></article>
        <article><span>Затронуто автомобилей</span><strong>{data.observations.vehiclesWithObservationsOlderThanCutoff}</strong></article>
        <article><span>Самое старое наблюдение</span><strong>{data.observations.oldestObservedAt ?? emptyTimestamp}</strong></article>
        <article><span>Самое новое наблюдение</span><strong>{data.observations.newestObservedAt ?? emptyTimestamp}</strong></article>
        <article><span>Checkpoint’ов всего</span><strong>{data.checkpoints.total}</strong></article>
        <article><span>Полностью старше границы</span><strong>{data.checkpoints.fullyObsolete}</strong></article>
        <article><span>Пересекают границу</span><strong>{data.checkpoints.boundaryOverlap}</strong></article>
        <article><span>Защищены</span><strong>{data.checkpoints.protected}</strong></article>
      </div>
      <p className="admin-history-disclaimer">Диапазоны checkpoint’ов Stage 14 включают обе границы. Наблюдение точно на границе хранения защищено; checkpoint, заканчивающийся точно на границе, считается пересекающим её.</p>
      {data.safety.hasBoundaryOverlap && <p className="notice" role="status">Некоторые checkpoint-диапазоны пересекают границу хранения. Они остаются защищёнными; этот экран ничего не удаляет.</p>}
      <p className="admin-history-disclaimer"><strong>Изменения не выполняются.</strong> Количество наблюдений старше границы — факт политики, а не утверждение, что все они уже безопасны для удаления.</p>
    </>}
  </section>;
}
