"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardVehiclesResponse } from "@/lib/dashboard/dashboard-contract";
import { formatDistance, formatGeneratedAt, formatSpeed, formatTimestamp, freshnessLabel, qualityLabel, sourceLabel, statusLabel } from "@/lib/dashboard/dashboard-formatters";
import { dashboardHistoryPath, shouldUpdateDashboardHistory, type DashboardNavigationReason } from "@/lib/dashboard/dashboard-navigation";
import { parseDashboardQuery, serializeDashboardQuery, type DashboardActivity, type DashboardQuery, type DashboardStatus } from "@/lib/dashboard/dashboard-query";
import { SchedulerStatus } from "@/components/scheduler-status";
import type { SchedulerStatusResponse } from "@/lib/scheduler/scheduler-contract";

type Props = Readonly<{ initialData: DashboardVehiclesResponse; initialQuery: DashboardQuery; initialSchedulerStatus: SchedulerStatusResponse | null }>;
function statusTone(status: string): string { return status === "online" ? "badge badge-online" : status === "offline" ? "badge badge-offline" : "badge badge-unknown"; }
function freshnessTone(value: string): string { return value === "fresh" ? "badge badge-fresh" : value === "missing" ? "badge badge-missing" : "badge badge-stale"; }

export function DashboardClient({ initialData, initialQuery, initialSchedulerStatus }: Props) {
  const [data, setData] = useState(initialData); const [query, setQuery] = useState<DashboardQuery>(initialQuery); const [loading, setLoading] = useState(false); const [error, setError] = useState(false); const first = useRef(true); const controller = useRef<AbortController | null>(null);
  const request = useCallback(async (next: DashboardQuery, reason: DashboardNavigationReason) => {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort; setLoading(true); setError(false);
    const encoded = serializeDashboardQuery(next); if (shouldUpdateDashboardHistory(reason)) window.history.pushState(null, "", dashboardHistoryPath(next));
    try { const response = await fetch(`/api/dashboard/vehicles${encoded ? `?${encoded}` : ""}`, { signal: abort.signal, cache: "no-store" }); if (!response.ok) throw new Error(); const body = await response.json() as DashboardVehiclesResponse; if (!abort.signal.aborted) setData(body); }
    catch { if (!abort.signal.aborted) setError(true); }
    finally { if (!abort.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => { if (first.current) { first.current = false; return; } const timer = window.setTimeout(() => { void request(query, "user"); }, 300); return () => window.clearTimeout(timer); }, [query, request]);
  useEffect(() => { const onPopState = () => { const restored = parseDashboardQuery(new URLSearchParams(window.location.search)); first.current = true; setQuery(restored); void request(restored, "popstate"); }; window.addEventListener("popstate", onPopState); return () => { window.removeEventListener("popstate", onPopState); controller.current?.abort(); }; }, [request]);
  const set = <K extends keyof DashboardQuery>(key: K, value: DashboardQuery[K]) => setQuery((current) => ({ ...current, [key]: value }));
  const retry = () => void request(query, error ? "retry" : "refresh");
  return <>
    <Header data={data} />
    <SchedulerStatus initialStatus={initialSchedulerStatus} timezone={data.timezone || "Europe/Kyiv"} />
    <section className="filters" aria-label="Фильтры автопарка">
      <label>Поиск по названию<input value={query.search ?? ""} onChange={(event) => set("search", event.target.value || undefined)} placeholder="Название машины" /></label>
      <label>Статус<select value={query.status ?? ""} onChange={(event) => set("status", (event.target.value || undefined) as DashboardStatus | undefined)}><option value="">Все</option><option value="online">Онлайн</option><option value="offline">Офлайн</option><option value="unknown">Неизвестно</option></select></label>
      <label>Активность<select value={query.activity ?? ""} onChange={(event) => set("activity", (event.target.value || undefined) as DashboardActivity | undefined)}><option value="">Все</option><option value="below_threshold">Ниже порога</option><option value="normal">Нормальный пробег</option><option value="no_data">Без данных</option></select></label>
      <label className="check"><input type="checkbox" checked={query.includeDisabled !== false} onChange={(event) => set("includeDisabled", event.target.checked)} /> Показывать отключённые</label>
      <button type="button" onClick={retry} disabled={loading}>{loading ? "Обновление…" : "Обновить"}</button>
    </section>
    {error && <section className="notice" role="alert"><span>⚠</span><div><strong>Не удалось загрузить данные автопарка</strong><button type="button" onClick={retry}>Повторить</button></div></section>}
    {loading && <p className="refresh" aria-live="polite">Обновление данных…</p>}
    <Summary data={data} />
    {data.vehicles.length === 0 ? <section className="empty"><h2>Ничего не найдено</h2><p>Измените фильтры, чтобы увидеть машины.</p></section> : <><div className="table-wrap"><table><thead><tr><th>Машина</th><th>Статус</th><th>GPS</th><th>Текущая скорость</th><th>Дневной пробег</th><th>Источник / качество</th><th>Активность</th></tr></thead><tbody>{data.vehicles.map((vehicle) => <tr key={vehicle.id}><td><strong>{vehicle.name}</strong>{vehicle.disabled && <span className="disabled">Отключена</span>}</td><td><span className={statusTone(vehicle.status)}>● {statusLabel(vehicle.status)}</span></td><td><span className={freshnessTone(vehicle.positionFreshness)}>◷ {freshnessLabel(vehicle.positionFreshness)}</span><small>{formatTimestamp(vehicle.fixTime, data.timezone)}</small></td><td>{formatSpeed(vehicle.speedKph)}</td><td className={vehicle.belowMinimumDistance ? "below" : ""}>{formatDistance(vehicle.dailyDistanceMeters)}</td><td><span>{sourceLabel(vehicle.dailyDistanceSource)}</span><small>{qualityLabel(vehicle.dailyDistanceQuality)}</small></td><td>{vehicle.belowMinimumDistance ? <span className="alert-label">Ниже порога</span> : vehicle.dailyDistanceMeters === null ? "Нет данных" : "Нормально"}</td></tr>)}</tbody></table></div><div className="mobile-list">{data.vehicles.map((vehicle) => <article className="vehicle-card" key={vehicle.id}><div><strong>{vehicle.name}</strong>{vehicle.disabled && <span className="disabled">Отключена</span>}</div><div className="badges"><span className={statusTone(vehicle.status)}>● {statusLabel(vehicle.status)}</span><span className={freshnessTone(vehicle.positionFreshness)}>◷ {freshnessLabel(vehicle.positionFreshness)}</span></div><dl><div><dt>Скорость</dt><dd>{formatSpeed(vehicle.speedKph)}</dd></div><div><dt>Пробег</dt><dd className={vehicle.belowMinimumDistance ? "below" : ""}>{formatDistance(vehicle.dailyDistanceMeters)}</dd></div><div><dt>Данные</dt><dd>{qualityLabel(vehicle.dailyDistanceQuality)}</dd></div></dl>{vehicle.belowMinimumDistance && <p className="alert-label">⚠ Пробег ниже порога</p>}</article>)}</div></>}
  </>;
}

function Summary({ data }: Readonly<{ data: DashboardVehiclesResponse }>) { const cards = [["Всего машин", data.summary.total, "▦"], ["Онлайн", data.summary.online, "●"], ["Офлайн", data.summary.offline, "○"], ["Неизвестно", data.summary.unknown, "?"], ["Свежие позиции", data.summary.freshPositions, "◷"], ["Устаревшие позиции", data.summary.stalePositions, "◴"], ["Без позиции", data.summary.withoutPosition, "—"], ["Ниже минимума", data.summary.belowMinimumDistance, "!"], ["Без данных пробега", data.summary.withoutDailyStat, "…"]] as const; return <section className="summary-grid" aria-label="Сводка автопарка">{cards.map(([label, value, marker]) => <article className="summary-card" key={label}><span aria-hidden="true">{marker}</span><div><p>{label}</p><strong>{value}</strong></div></article>)}</section>; }
function Header({ data }: Readonly<{ data: DashboardVehiclesResponse }>) { return <header className="hero"><p className="eyebrow">Локальный кэш автопарка</p><h1>Автопарк</h1><p>Оперативное состояние и пробег за текущий день</p><div className="metadata"><span>Дата сервиса: <strong>{data.serviceDate}</strong></span><span>Часовой пояс: <strong>{data.timezone}</strong></span><span>Машин: <strong>{data.summary.total}</strong></span><span>Сформировано: <time dateTime={data.generatedAt}>{formatGeneratedAt(data.generatedAt, data.timezone)}</time></span></div></header>; }
