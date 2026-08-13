"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AUDIT_ACTOR_TYPES, AUDIT_EVENT_TYPES, AUDIT_TARGET_TYPES, parseAuditReadResponse, type AuditReadItem } from "../lib/audit/audit-contract";
import { normalizeAuditFilters, serializeAuditRequestQuery, type AuditFilters } from "../lib/audit/audit-query";
import { AUDIT_EVENT_LABELS, AUDIT_TARGET_LABELS, auditActorLabel, auditDetailsLines, auditTargetLabel, formatAuditTimestamp } from "../lib/audit/audit-ui-model";
import { beginAuditFirstPage, beginAuditLoadMore, canLoadMoreAudit, failAuditFirstPage, failAuditLoadMore, initialAuditViewerState, succeedAuditFirstPage, succeedAuditLoadMore } from "../lib/audit/audit-viewer-state";

type DraftFilters = { eventType: string; actorType: string; targetType: string; from: string; to: string };
const emptyDraft = (): DraftFilters => ({ eventType: "", actorType: "", targetType: "", from: "", to: "" });

async function requestAudit(query: string, signal: AbortSignal): Promise<ReturnType<typeof parseAuditReadResponse>> {
  const response = await fetch(`/api/admin/audit${query ? `?${query}` : ""}`, { method: "GET", cache: "no-store", signal, headers: { Accept: "application/json" } });
  if (response.status === 401) { window.location.replace("/login"); throw new Error(); }
  if (response.status === 403) { window.location.replace("/forbidden"); throw new Error(); }
  if (!response.ok) throw new Error();
  return parseAuditReadResponse(await response.json());
}

export function AuditEventTable({ items }: Readonly<{ items: readonly AuditReadItem[] }>) {
  return <div className="audit-table"><table><thead><tr><th>Время</th><th>Событие</th><th>Инициатор</th><th>Цель</th><th>Описание</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><time dateTime={item.createdAt}>{formatAuditTimestamp(item.createdAt)}</time></td><td>{AUDIT_EVENT_LABELS[item.eventType]}</td><td>{auditActorLabel(item)}</td><td>{auditTargetLabel(item)}</td><td><ul className="audit-details">{auditDetailsLines(item).map((line) => <li key={line}>{line}</li>)}</ul></td></tr>)}</tbody></table></div>;
}

export function AuditViewer() {
  const [state, setState] = useState(initialAuditViewerState);
  const [draft, setDraft] = useState<DraftFilters>(emptyDraft);
  const [filterError, setFilterError] = useState(false);
  const firstController = useRef<AbortController | null>(null);
  const moreController = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const moreInFlight = useRef(false);

  const loadFirst = useCallback(async (filters: AuditFilters) => {
    firstController.current?.abort(); moreController.current?.abort(); moreController.current = null; moreInFlight.current = false;
    const requestGeneration = generation.current + 1; generation.current = requestGeneration;
    const controller = new AbortController(); firstController.current = controller;
    setState((current) => beginAuditFirstPage(current, filters));
    try {
      const page = await requestAudit(serializeAuditRequestQuery(filters), controller.signal);
      if (!controller.signal.aborted && generation.current === requestGeneration) setState((current) => succeedAuditFirstPage(current, page));
    } catch { if (!controller.signal.aborted && generation.current === requestGeneration) setState(failAuditFirstPage); }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadFirst({}), 0);
    return () => { window.clearTimeout(initialLoad); firstController.current?.abort(); moreController.current?.abort(); moreInFlight.current = false; };
  }, [loadFirst]);

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const filters = normalizeAuditFilters({ eventType: draft.eventType, actorType: draft.actorType, targetType: draft.targetType, from: draft.from, to: draft.to });
      setFilterError(false); void loadFirst(filters);
    } catch { setFilterError(true); }
  };
  const reset = () => { setDraft(emptyDraft()); setFilterError(false); void loadFirst({}); };
  const loadMore = async () => {
    const cursor = state.data.nextCursor;
    if (moreInFlight.current || !canLoadMoreAudit(state) || cursor === null) return;
    moreInFlight.current = true; const requestGeneration = generation.current; const controller = new AbortController(); moreController.current = controller; setState(beginAuditLoadMore);
    try {
      const page = await requestAudit(serializeAuditRequestQuery({ ...state.filters, cursor }), controller.signal);
      if (!controller.signal.aborted && generation.current === requestGeneration && moreController.current === controller) setState((current) => succeedAuditLoadMore(current, page));
    } catch { if (!controller.signal.aborted && generation.current === requestGeneration && moreController.current === controller) setState(failAuditLoadMore); }
    finally { if (moreController.current === controller) { moreController.current = null; moreInFlight.current = false; } }
  };

  return <>
    <header className="hero"><p className="eyebrow">Администрирование</p><h1>Аудит</h1><p>Неизменяемая история административных и событий безопасности.</p></header>
    <form className="audit-filters" onSubmit={apply} aria-label="Фильтры аудита">
      <label>Тип события<select value={draft.eventType} onChange={(event) => setDraft((current) => ({ ...current, eventType: event.target.value }))}><option value="">Все</option>{AUDIT_EVENT_TYPES.map((value) => <option key={value} value={value}>{AUDIT_EVENT_LABELS[value]}</option>)}</select></label>
      <label>Инициатор<select value={draft.actorType} onChange={(event) => setDraft((current) => ({ ...current, actorType: event.target.value }))}><option value="">Все</option>{AUDIT_ACTOR_TYPES.map((value) => <option key={value} value={value}>{value === "USER" ? "Пользователь" : "Система"}</option>)}</select></label>
      <label>Тип цели<select value={draft.targetType} onChange={(event) => setDraft((current) => ({ ...current, targetType: event.target.value }))}><option value="">Все</option>{AUDIT_TARGET_TYPES.map((value) => <option key={value} value={value}>{AUDIT_TARGET_LABELS[value]}</option>)}</select></label>
      <label>С<input type="text" inputMode="text" placeholder="2026-08-11T02:00:00.000Z" value={draft.from} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} /></label>
      <label>По<input type="text" inputMode="text" placeholder="2026-08-12T02:00:00.000Z" value={draft.to} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} /></label>
      <div className="audit-filter-actions"><button type="submit" disabled={state.loading}>Применить</button><button type="button" className="secondary-button" onClick={reset} disabled={state.loading}>Сбросить</button><button type="button" onClick={() => void loadFirst(state.filters)} disabled={state.loading}>Обновить</button></div>
    </form>
    {filterError && <p className="admin-error" role="alert">Укажите абсолютные даты со смещением часового пояса; начало не должно быть позже окончания.</p>}
    {state.error && <section className="notice" role="alert"><span>⚠</span><div><strong>{state.error === "more" ? "Не удалось загрузить следующую страницу аудита." : "Не удалось загрузить аудит."}</strong><button type="button" onClick={() => state.error === "more" ? void loadMore() : void loadFirst(state.filters)}>Повторить</button></div></section>}
    {(state.loading || state.moreLoading) && <p className="refresh" aria-live="polite">{state.moreLoading ? "Загрузка следующих событий…" : "Обновление аудита…"}</p>}
    {!state.loading && state.data.items.length === 0 ? <section className="empty"><h2>События аудита не найдены.</h2><p>Измените фильтры или обновите список.</p></section> : <AuditEventTable items={state.data.items} />}
    {canLoadMoreAudit(state) && <div className="load-more"><button type="button" onClick={() => void loadMore()} disabled={state.moreLoading}>{state.moreLoading ? "Загрузка…" : "Показать ещё"}</button></div>}
  </>;
}
