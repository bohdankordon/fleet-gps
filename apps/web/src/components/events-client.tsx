"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AlertEventsListResponse, AlertEventsSummaryResponse } from "@/lib/alert-events/alert-events-contract";
import { parseAlertEventsListResponse, parseAlertEventsSummaryResponse } from "@/lib/alert-events/alert-events-contract";
import { alertDetailsLabel, alertStatusLabel, alertTypeLabel, formatAlertTimestamp, notificationDeliveryLabel } from "@/lib/alert-events/alert-events-formatters";
import { alertEventsHistoryPath, shouldUpdateAlertEventsHistory, type AlertEventsNavigationReason } from "@/lib/alert-events/alert-events-navigation";
import { ALERT_EVENTS_PAGE_SIZE, parseAlertEventsFilters, serializeAlertEventsRequestQuery, type AlertEventsFilters, type AlertEventsStatus, type AlertEventsType } from "@/lib/alert-events/alert-events-query";
import { abortAlertEventsLoadMore, beginAlertEventsFirstPage, beginAlertEventsLoadMore, canLoadMoreAlertEvents, failAlertEventsFirstPage, failAlertEventsLoadMore, initialAlertEventsListState, isCurrentAlertEventsGeneration, succeedAlertEventsFirstPage, succeedAlertEventsLoadMore } from "@/lib/alert-events/alert-events-request-state";
import { emptyAlertEventsMessage } from "@/lib/alert-events/alert-events-ui-model";

type Props = Readonly<{ initialData: AlertEventsListResponse; initialSummary: AlertEventsSummaryResponse | null; initialFilters: AlertEventsFilters }>;
function alertTone(status: string): string { return status === "OPEN" ? "badge badge-alert-open" : "badge badge-alert-resolved"; }
function deliveryTone(status: string): string { return status === "SENT" ? "badge badge-delivery-sent" : status === "FAILED" ? "badge badge-delivery-failed" : status === "PENDING" ? "badge badge-delivery-pending" : "badge badge-delivery-none"; }
async function bffJson(path: string, signal: AbortSignal): Promise<unknown> { const response = await fetch(path, { cache: "no-store", signal }); if (!response.ok) throw new Error(); return response.json(); }

export function EventsClient({ initialData, initialSummary, initialFilters }: Props) {
  const [list, setList] = useState(() => initialAlertEventsListState(initialData, initialFilters));
  const [summary, setSummary] = useState(initialSummary); const [summaryError, setSummaryError] = useState(initialSummary === null);
  const primaryController = useRef<AbortController | null>(null); const moreController = useRef<AbortController | null>(null); const moreInFlight = useRef(false); const generation = useRef(0);

  const firstRequest = useCallback(async (next: AlertEventsFilters, reason: AlertEventsNavigationReason) => {
    primaryController.current?.abort(); moreController.current?.abort(); moreController.current = null; moreInFlight.current = false;
    const requestGeneration = generation.current + 1; generation.current = requestGeneration; const controller = new AbortController(); primaryController.current = controller;
    setList((current) => abortAlertEventsLoadMore(beginAlertEventsFirstPage(current, next)));
    if (shouldUpdateAlertEventsHistory(reason)) window.history.pushState(null, "", alertEventsHistoryPath(next));
    const query = serializeAlertEventsRequestQuery({ ...next, limit: ALERT_EVENTS_PAGE_SIZE }); const [listResult, summaryResult] = await Promise.allSettled([bffJson(`/api/alert-events?${query}`, controller.signal), bffJson("/api/alert-events/summary", controller.signal)]);
    if (controller.signal.aborted || !isCurrentAlertEventsGeneration(requestGeneration, generation.current)) return;
    if (listResult.status === "fulfilled") { try { const data = parseAlertEventsListResponse(listResult.value); setList((current) => succeedAlertEventsFirstPage(current, next, data)); } catch { setList(failAlertEventsFirstPage); } } else setList(failAlertEventsFirstPage);
    if (summaryResult.status === "fulfilled") { try { setSummary(parseAlertEventsSummaryResponse(summaryResult.value)); setSummaryError(false); } catch { setSummaryError(true); } } else setSummaryError(true);
  }, []);

  useEffect(() => { const onPopState = () => { try { void firstRequest(parseAlertEventsFilters(new URLSearchParams(window.location.search)), "popstate"); } catch { window.history.replaceState(null, "", "/events"); void firstRequest({}, "popstate"); } }; window.addEventListener("popstate", onPopState); return () => { window.removeEventListener("popstate", onPopState); primaryController.current?.abort(); moreController.current?.abort(); moreInFlight.current = false; }; }, [firstRequest]);
  const change = <K extends keyof AlertEventsFilters>(key: K, value: AlertEventsFilters[K]) => { void firstRequest({ ...list.filters, [key]: value }, "user"); };
  const loadMore = async () => {
    if (moreInFlight.current || !canLoadMoreAlertEvents(list)) return;
    moreInFlight.current = true; const requestGeneration = generation.current; const controller = new AbortController(); moreController.current = controller; setList(beginAlertEventsLoadMore);
    try {
      const query = serializeAlertEventsRequestQuery({ ...list.filters, limit: ALERT_EVENTS_PAGE_SIZE, cursor: list.data.nextCursor ?? undefined }); const page = parseAlertEventsListResponse(await bffJson(`/api/alert-events?${query}`, controller.signal));
      if (!controller.signal.aborted && isCurrentAlertEventsGeneration(requestGeneration, generation.current) && moreController.current === controller) setList((current) => succeedAlertEventsLoadMore(current, page));
    } catch { if (!controller.signal.aborted && isCurrentAlertEventsGeneration(requestGeneration, generation.current) && moreController.current === controller) setList(failAlertEventsLoadMore); }
    finally { if (isCurrentAlertEventsGeneration(requestGeneration, generation.current) && moreController.current === controller) { moreInFlight.current = false; moreController.current = null; } }
  };
  const retry = () => { if (list.error === "more") void loadMore(); else void firstRequest(list.filters, list.error === "first" ? "retry" : "refresh"); };
  const empty = emptyAlertEventsMessage(list.filters.status !== undefined || list.filters.type !== undefined);
  return <>
    <header className="hero"><p className="eyebrow">Уведомления автопарка</p><h1>События</h1><p>История автоматических нарушений и доставки Telegram-уведомлений.</p></header>
    <section className="events-summary" aria-label="Открытые события"><article><span>Открытых всего</span><strong>{summary?.open.total ?? "—"}</strong></article><article><span>Превышение скорости</span><strong>{summary?.open.speeding ?? "—"}</strong></article><article><span>Неактивность</span><strong>{summary?.open.inactivity ?? "—"}</strong></article></section>
    <section className="filters events-filters" aria-label="Фильтры событий"><label>Статус<select value={list.filters.status ?? ""} onChange={(event) => change("status", (event.target.value || undefined) as AlertEventsStatus | undefined)}><option value="">Все</option><option value="OPEN">Открытые</option><option value="RESOLVED">Завершённые</option></select></label><label>Тип<select value={list.filters.type ?? ""} onChange={(event) => change("type", (event.target.value || undefined) as AlertEventsType | undefined)}><option value="">Все</option><option value="SPEEDING">Превышение скорости</option><option value="INACTIVITY">Неактивность</option></select></label><button type="button" onClick={() => void firstRequest(list.filters, "refresh")} disabled={list.loading}>{list.loading ? "Обновление…" : "Обновить"}</button></section>
    {(list.error || summaryError) && <section className="notice" role="alert"><span>⚠</span><div><strong>{list.error === "more" ? "Не удалось загрузить следующие события" : list.error === "first" ? "Не удалось загрузить события" : "Не удалось загрузить сводку"}</strong><button type="button" onClick={retry}>Повторить</button></div></section>}
    {(list.loading || list.moreLoading) && <p className="refresh" aria-live="polite">{list.moreLoading ? "Загрузка следующих событий…" : "Обновление событий…"}</p>}
    {list.data.items.length === 0 ? <section className="empty"><h2>{empty.heading}</h2><p>{empty.text}</p></section> : <><div className="table-wrap events-table"><table><thead><tr><th>Автомобиль</th><th>Тип</th><th>Статус</th><th>Открыто</th><th>Уведомление</th><th>Детали</th><th>Завершено</th></tr></thead><tbody>{list.data.items.map((event) => <tr key={event.id}><td><strong><Link href={`/vehicles/${event.vehicle.id}`}>{event.vehicle.name}</Link></strong></td><td>{alertTypeLabel(event.type)}</td><td><span className={alertTone(event.status)}>{alertStatusLabel(event.status)}</span></td><td><time dateTime={event.openedAt}>{formatAlertTimestamp(event.openedAt)}</time></td><td><span className={deliveryTone(event.notificationDeliveryStatus)}>{notificationDeliveryLabel(event.notificationDeliveryStatus)}</span></td><td className="event-details">{alertDetailsLabel(event)}</td><td>{event.resolvedAt === null ? "—" : <time dateTime={event.resolvedAt}>{formatAlertTimestamp(event.resolvedAt)}</time>}</td></tr>)}</tbody></table></div><div className="mobile-list events-mobile-list">{list.data.items.map((event) => <article className="event-card" key={event.id}><div className="event-card-heading"><strong><Link href={`/vehicles/${event.vehicle.id}`}>{event.vehicle.name}</Link></strong><span>{alertTypeLabel(event.type)}</span></div><div className="badges"><span className={alertTone(event.status)}>{alertStatusLabel(event.status)}</span><span className={deliveryTone(event.notificationDeliveryStatus)}>{notificationDeliveryLabel(event.notificationDeliveryStatus)}</span></div><dl><div><dt>Открыто</dt><dd><time dateTime={event.openedAt}>{formatAlertTimestamp(event.openedAt)}</time></dd></div><div><dt>Завершено</dt><dd>{event.resolvedAt === null ? "—" : <time dateTime={event.resolvedAt}>{formatAlertTimestamp(event.resolvedAt)}</time>}</dd></div><div className="event-card-details"><dt>Детали</dt><dd>{alertDetailsLabel(event)}</dd></div></dl></article>)}</div></>}
    {canLoadMoreAlertEvents(list) && <div className="load-more"><button type="button" onClick={() => void loadMore()} disabled={list.loading || list.moreLoading}>{list.moreLoading ? "Загрузка…" : "Показать ещё"}</button></div>}
  </>;
}
