"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AUDIT_ACTOR_TYPES, AUDIT_EVENT_TYPES, AUDIT_TARGET_TYPES, parseAuditReadResponse, type AuditReadItem } from "../lib/audit/audit-contract";
import { normalizeAuditLocalFilters, serializeAuditRequestQuery, type AuditFilters } from "../lib/audit/audit-query";
import { auditActorLabel, auditDetailsLines, auditEventLabel, auditTargetLabel, auditTargetTypeLabel, formatAuditTimestamp } from "../lib/audit/audit-ui-model";
import { beginAuditFirstPage, beginAuditLoadMore, canLoadMoreAudit, failAuditFirstPage, failAuditLoadMore, initialAuditViewerState, succeedAuditFirstPage, succeedAuditLoadMore } from "../lib/audit/audit-viewer-state";
import { useI18n } from "../i18n/client";
import { WarningIcon } from "./ui/icons";

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
  const { locale, t } = useI18n();
  return <div className="audit-table"><table><thead><tr><th>{t("audit.table.time")}</th><th>{t("audit.table.event")}</th><th>{t("audit.table.actor")}</th><th>{t("audit.table.target")}</th><th>{t("audit.table.description")}</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><time dateTime={item.createdAt}>{formatAuditTimestamp(item.createdAt, locale)}</time></td><td>{auditEventLabel(item.eventType, locale)}</td><td>{auditActorLabel(item, locale)}</td><td>{auditTargetLabel(item, locale)}</td><td><ul className="audit-details">{auditDetailsLines(item, locale).map((line) => <li key={line}>{line}</li>)}</ul></td></tr>)}</tbody></table></div>;
}

export function AuditViewer() {
  const { locale, t } = useI18n();
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
      const filters = normalizeAuditLocalFilters({ eventType: draft.eventType, actorType: draft.actorType, targetType: draft.targetType, from: draft.from, to: draft.to });
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
    <header className="hero"><p className="eyebrow">{t("common.administration")}</p><h1>{t("audit.title")}</h1><p>{t("audit.description")}</p></header>
    <form className="audit-filters" onSubmit={apply} aria-label={t("audit.filters.label")}>
      <label>{t("audit.filters.eventType")}<select value={draft.eventType} onChange={(event) => setDraft((current) => ({ ...current, eventType: event.target.value }))}><option value="">{t("common.all")}</option>{AUDIT_EVENT_TYPES.map((value) => <option key={value} value={value}>{auditEventLabel(value, locale)}</option>)}</select></label>
      <label>{t("audit.filters.actor")}<select value={draft.actorType} onChange={(event) => setDraft((current) => ({ ...current, actorType: event.target.value }))}><option value="">{t("common.all")}</option>{AUDIT_ACTOR_TYPES.map((value) => <option key={value} value={value}>{value === "USER" ? t("audit.actor.user") : t("audit.actor.system")}</option>)}</select></label>
      <label>{t("audit.filters.targetType")}<select value={draft.targetType} onChange={(event) => setDraft((current) => ({ ...current, targetType: event.target.value }))}><option value="">{t("common.all")}</option>{AUDIT_TARGET_TYPES.map((value) => <option key={value} value={value}>{auditTargetTypeLabel(value, locale)}</option>)}</select></label>
      <label>{t("audit.filters.from")}<input type="datetime-local" step="60" value={draft.from} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} /></label>
      <label>{t("audit.filters.to")}<input type="datetime-local" step="60" value={draft.to} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} /></label>
      <p className="audit-filter-timezone">{t("track.controls.timezone")}</p>
      <div className="audit-filter-actions"><button type="submit" disabled={state.loading}>{t("audit.filters.apply")}</button><button type="button" className="secondary-button" onClick={reset} disabled={state.loading}>{t("audit.filters.reset")}</button><button type="button" onClick={() => void loadFirst(state.filters)} disabled={state.loading}>{t("common.refresh")}</button></div>
    </form>
    {filterError && <p className="admin-error" role="alert">{t("audit.filters.invalid")}</p>}
    {state.error && <section className="notice" role="alert"><WarningIcon className="notice-icon" /><div><strong>{state.error === "more" ? t("audit.loadMoreError") : t("audit.loadError")}</strong><button type="button" onClick={() => state.error === "more" ? void loadMore() : void loadFirst(state.filters)}>{t("common.retry")}</button></div></section>}
    {(state.loading || state.moreLoading) && <p className="refresh" aria-live="polite">{state.moreLoading ? t("audit.loadingMore") : t("audit.loading")}</p>}
    {!state.loading && state.data.items.length === 0 ? <section className="empty"><h2>{t("audit.emptyTitle")}</h2><p>{t("audit.emptyText")}</p></section> : <AuditEventTable items={state.data.items} />}
    {canLoadMoreAudit(state) && <div className="load-more"><button type="button" onClick={() => void loadMore()} disabled={state.moreLoading}>{state.moreLoading ? t("common.loading") : t("audit.loadMore")}</button></div>}
  </>;
}
