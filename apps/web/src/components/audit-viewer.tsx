"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeftOutlined, CalendarOutlined, DownOutlined, FilterOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, DatePicker, Empty, Flex, Grid, Popover, Select, Skeleton, Space, Tag, Typography } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { AUDIT_ACTOR_TYPES, AUDIT_EVENT_TYPES, AUDIT_TARGET_TYPES, parseAuditReadResponse, type AuditReadItem } from "../lib/audit/audit-contract";
import { hasAuditFilters, normalizeAuditFilters, normalizeAuditLocalFilters, parseAuditPageQuery, serializeAuditPageQuery, serializeAuditRequestQuery, type AuditFilters } from "../lib/audit/audit-query";
import { auditActorLabel, auditDetailPresentation, auditEventLabel, auditOutcome, auditTargetLabel, auditTargetTypeLabel, formatAuditTimestamp } from "../lib/audit/audit-ui-model";
import { beginAuditFirstPage, beginAuditLoadMore, canLoadMoreAudit, failAuditFirstPage, failAuditLoadMore, initialAuditViewerState, succeedAuditFirstPage, succeedAuditLoadMore } from "../lib/audit/audit-viewer-state";
import { absoluteToKyivLocal } from "../lib/vehicle-track/vehicle-track-custom-range";
import { useI18n } from "../i18n/client";
import { CompactPageHeading } from "./compact-page-heading";
import { StableLoadingButton } from "./stable-loading-button";
import { PeriodPopover } from "./period-popover";

// Picker values are floating civil fields, not browser-local instants. Kyiv resolves them only on Apply.
dayjs.extend(utc);

type SecondaryDraft = { eventType: string; actorType: string; targetType: string };
const secondaryDraft = (filters: AuditFilters): SecondaryDraft => ({ eventType: filters.eventType ?? "", actorType: filters.actorType ?? "", targetType: filters.targetType ?? "" });
const localTime = (value: string | undefined): string => value ? (absoluteToKyivLocal(value) ?? "") : "";

async function requestAudit(query: string, signal: AbortSignal): Promise<ReturnType<typeof parseAuditReadResponse>> {
  const response = await fetch(`/api/admin/audit${query ? `?${query}` : ""}`, { method: "GET", cache: "no-store", signal, headers: { Accept: "application/json" } });
  if (response.status === 401) { window.location.replace("/login"); throw new Error(); }
  if (response.status === 403) { window.location.replace("/forbidden"); throw new Error(); }
  if (!response.ok) throw new Error();
  return parseAuditReadResponse(await response.json());
}

function AuditEventDetail({ item, mobile = false, onBack, idPrefix = "desktop" }: Readonly<{ item: AuditReadItem; mobile?: boolean; onBack?: () => void; idPrefix?: string }>) {
  const { locale, t } = useI18n(); const detail = auditDetailPresentation(item, locale);
  return <article id={`audit-${idPrefix}-detail-${item.id}`} className={`audit-inspector${mobile ? " audit-inspector--mobile" : ""}`} aria-labelledby={`audit-${idPrefix}-detail-title-${item.id}`}>
    {mobile && <Button className="audit-mobile-back" type="text" icon={<ArrowLeftOutlined aria-hidden />} onClick={onBack}>{t("audit.back")}</Button>}
    <header className="audit-inspector__header"><Typography.Text type="secondary">{t("audit.selectedEvent")}</Typography.Text><Typography.Title id={`audit-${idPrefix}-detail-title-${item.id}`} className="audit-inspector__title" level={3}>{auditEventLabel(item.eventType, locale)}</Typography.Title></header>
    <dl className="audit-inspector__meta">
      <div><dt>{t("audit.table.time")}</dt><dd><time dateTime={item.createdAt}>{formatAuditTimestamp(item.createdAt, locale)}</time></dd></div>
      <div><dt>{t("audit.table.actor")}</dt><dd>{auditActorLabel(item, locale)}</dd></div>
      <div><dt>{t("audit.table.target")}</dt><dd>{auditTargetLabel(item, locale)}</dd></div>
      {item.target.id !== null && <div className="audit-inspector__technical"><dt>{t("audit.targetIdentifier")}</dt><dd>{item.target.id}</dd></div>}
    </dl>
    {detail.unavailable ? <Alert type="warning" showIcon title={t("audit.unavailableDetails")} description={t("audit.unavailableDetailsText")} /> : <div className="audit-inspector__groups">{detail.groups.map((group) => <section key={group.key}><Typography.Title level={4}>{group.title}</Typography.Title><ul>{group.lines.map((line) => <li key={line}>{line}</li>)}</ul></section>)}</div>}
  </article>;
}

export function AuditEventTable({ items, selectedId = null, onSelect = () => undefined, showInlineDetails = false }: Readonly<{ items: readonly AuditReadItem[]; selectedId?: string | null; onSelect?: (item: AuditReadItem, trigger: HTMLButtonElement) => void; showInlineDetails?: boolean }>) {
  const { locale, t } = useI18n();
  return <ol className="audit-chronology__list">{items.map((item) => {
    const selected = selectedId === item.id; const detailId = `audit-inline-detail-${item.id}`;
    return <li className={`audit-record${selected ? " audit-record--selected" : ""}`} key={item.id}>
      <button id={`audit-event-${item.id}`} type="button" className="audit-record__button" aria-pressed={selected} aria-expanded={showInlineDetails ? selected : undefined} aria-controls={showInlineDetails ? detailId : selected ? `audit-desktop-detail-${item.id}` : undefined} onClick={(event) => onSelect(item, event.currentTarget)}>
        <span className="audit-record__time"><time dateTime={item.createdAt}>{formatAuditTimestamp(item.createdAt, locale)}</time></span>
        <strong className="audit-record__title">{auditEventLabel(item.eventType, locale)}</strong>
        <span className="audit-record__target">{auditTargetLabel(item, locale)}</span>
        <span className="audit-record__actor">{t("audit.actorPrefix", { actor: auditActorLabel(item, locale) })}</span>
        <span className="audit-record__outcome">{auditOutcome(item, locale)}</span>
      </button>
      {showInlineDetails && <div id={detailId} className="audit-inline-detail" hidden={!selected}>{selected && <AuditEventDetail item={item} idPrefix="inline" />}</div>}
    </li>;
  })}</ol>;
}

export function AuditViewer({ navigation, initialFilters = {}, initialQueryValid = true }: Readonly<{ navigation?: ReactNode; initialFilters?: AuditFilters; initialQueryValid?: boolean }>) {
  const { locale, t } = useI18n(); const screens = Grid.useBreakpoint(); const isMobile = screens.md === false;
  const initial = useRef(initialFilters); const [state, setState] = useState(() => initialAuditViewerState(initialFilters));
  const [secondary, setSecondary] = useState(() => secondaryDraft(initialFilters)); const [filterOpen, setFilterOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const periodTrigger = useRef<HTMLButtonElement | null>(null);
  const closePeriod = () => { setPeriodOpen(false); periodTrigger.current?.focus(); };
  const [fromDraft, setFromDraft] = useState(() => localTime(initialFilters.from)); const [toDraft, setToDraft] = useState(() => localTime(initialFilters.to)); const [filterError, setFilterError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null); const selectedRef = useRef<string | null>(null); const itemsRef = useRef<readonly AuditReadItem[]>([]);
  const selectionTriggerId = useRef<string | null>(null); const mobileDetail = useRef<HTMLDivElement | null>(null); const savedScroll = useRef(0); const mobileHistoryActive = useRef(false);
  const previousMobile = useRef<boolean | null>(null); const unwindingMobileHistory = useRef(false);
  const firstController = useRef<AbortController | null>(null); const moreController = useRef<AbortController | null>(null); const generation = useRef(0); const moreInFlight = useRef(false);

  useEffect(() => { selectedRef.current = selectedId; itemsRef.current = state.data.items; }, [selectedId, state.data.items]);

  const loadFirst = useCallback(async (filters: AuditFilters, retainData = false) => {
    firstController.current?.abort(); moreController.current?.abort(); moreController.current = null; moreInFlight.current = false;
    const requestGeneration = generation.current + 1; generation.current = requestGeneration; const controller = new AbortController(); firstController.current = controller;
    setState((current) => beginAuditFirstPage(current, filters, retainData));
    try {
      const page = await requestAudit(serializeAuditRequestQuery(filters), controller.signal);
      if (!controller.signal.aborted && generation.current === requestGeneration) { setState((current) => succeedAuditFirstPage(current, page)); setSelectedId((id) => id && page.items.some((item) => item.id === id) ? id : null); }
    } catch { if (!controller.signal.aborted && generation.current === requestGeneration) setState(failAuditFirstPage); }
  }, []);

  const restoreFocusAndScroll = useCallback(() => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => { window.scrollTo({ top: savedScroll.current }); const triggerId = selectionTriggerId.current; if (triggerId) document.getElementById(triggerId)?.focus({ preventScroll: true }); }));
  }, []);
  const closeMobileDetail = useCallback(() => { mobileHistoryActive.current = false; setSelectedId(null); restoreFocusAndScroll(); }, [restoreFocusAndScroll]);

  useEffect(() => {
    if (!initialQueryValid) window.history.replaceState({ auditFilters: true }, "", "/admin/audit");
    const initialLoad = window.setTimeout(() => void loadFirst(initial.current), 0);
    return () => { window.clearTimeout(initialLoad); firstController.current?.abort(); moreController.current?.abort(); moreInFlight.current = false; };
  }, [initialQueryValid, loadFirst]);

  useEffect(() => { if (isMobile && selectedId) mobileDetail.current?.querySelector<HTMLButtonElement>(".audit-mobile-back")?.focus(); }, [isMobile, selectedId]);

  useEffect(() => {
    const wasMobile = previousMobile.current; previousMobile.current = isMobile;
    if (wasMobile === null || wasMobile === isMobile) return;
    if (isMobile && selectedId && !mobileHistoryActive.current) {
      mobileHistoryActive.current = true; savedScroll.current = window.scrollY;
      const base = typeof window.history.state === "object" && window.history.state !== null ? { ...window.history.state } : {};
      delete base.auditDetailId; window.history.replaceState(base, "", window.location.href); window.history.pushState({ ...base, auditDetailId: selectedId }, "", window.location.href);
    } else if (!isMobile && mobileHistoryActive.current) {
      mobileHistoryActive.current = false;
      if (typeof window.history.state?.auditDetailId === "string") {
        unwindingMobileHistory.current = true;
        const base = typeof window.history.state === "object" && window.history.state !== null ? { ...window.history.state } : {};
        delete base.auditDetailId; window.history.replaceState(base, "", window.location.href); window.history.back();
      }
    }
  }, [isMobile, selectedId]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (unwindingMobileHistory.current) { unwindingMobileHistory.current = false; return; }
      const eventId = typeof event.state?.auditDetailId === "string" ? event.state.auditDetailId : null;
      if (eventId && itemsRef.current.some((item) => item.id === eventId)) { mobileHistoryActive.current = true; setSelectedId(eventId); return; }
      if (mobileHistoryActive.current && selectedRef.current !== null) { closeMobileDetail(); return; }
      mobileHistoryActive.current = false;
      const parsed = parseAuditPageQuery(new URLSearchParams(window.location.search));
      if (!parsed.valid) window.history.replaceState({ auditFilters: true }, "", "/admin/audit");
      const filters = parsed.valid ? parsed.filters : {};
      setSelectedId(null); setSecondary(secondaryDraft(filters)); setFromDraft(localTime(filters.from)); setToDraft(localTime(filters.to)); setFilterError(false); setFilterOpen(false); setPeriodOpen(false); void loadFirst(filters);
    };
    window.addEventListener("popstate", onPopState); return () => window.removeEventListener("popstate", onPopState);
  }, [closeMobileDetail, loadFirst]);

  const applyFilters = (filters: AuditFilters) => {
    const query = serializeAuditPageQuery(filters); window.history.pushState({ auditFilters: true }, "", query ? `/admin/audit?${query}` : "/admin/audit");
    setSelectedId(null); setFilterError(false); void loadFirst(filters);
  };
  const applyTime = (event: React.FormEvent) => { event.preventDefault(); try { applyFilters(normalizeAuditLocalFilters({ ...secondaryDraft(state.filters), from: fromDraft, to: toDraft })); closePeriod(); } catch { setFilterError(true); } };
  const allHistory = () => { setFromDraft(""); setToDraft(""); applyFilters({ ...state.filters, from: undefined, to: undefined }); closePeriod(); };
  const applySecondary = (event: React.FormEvent) => { event.preventDefault(); try { applyFilters(normalizeAuditFilters({ ...secondary, from: state.filters.from, to: state.filters.to })); setFilterOpen(false); } catch { setFilterError(true); } };
  const removeSecondary = (key: "eventType" | "actorType" | "targetType") => { const next = { ...state.filters, [key]: undefined }; setSecondary(secondaryDraft(next)); applyFilters(next); };
  const secondaryCount = Number(Boolean(state.filters.eventType)) + Number(Boolean(state.filters.actorType)) + Number(Boolean(state.filters.targetType));
  const selected = state.data.items.find((item) => item.id === selectedId) ?? null;
  const timeSummary = !state.filters.from && !state.filters.to ? t("audit.time.allHistory") : state.filters.from && state.filters.to ? t("audit.time.range", { from: formatAuditTimestamp(state.filters.from, locale), to: formatAuditTimestamp(state.filters.to, locale) }) : state.filters.from ? t("audit.time.fromOnly", { from: formatAuditTimestamp(state.filters.from, locale) }) : t("audit.time.toOnly", { to: formatAuditTimestamp(state.filters.to!, locale) });
  const selectEvent = (item: AuditReadItem, trigger: HTMLButtonElement) => { selectionTriggerId.current = trigger.id; setSelectedId(item.id); if (isMobile) { mobileHistoryActive.current = true; savedScroll.current = window.scrollY; const base = typeof window.history.state === "object" && window.history.state !== null ? { ...window.history.state } : {}; delete base.auditDetailId; window.history.replaceState(base, "", window.location.href); window.history.pushState({ ...base, auditDetailId: item.id }, "", window.location.href); } };
  const back = () => { if (window.history.state?.auditDetailId === selectedId) window.history.back(); else closeMobileDetail(); };
  const refresh = () => void loadFirst(state.filters, state.data.items.length > 0);
  const loadMore = async () => {
    const cursor = state.data.nextCursor; if (moreInFlight.current || !canLoadMoreAudit(state) || cursor === null) return;
    moreInFlight.current = true; const requestGeneration = generation.current; const controller = new AbortController(); moreController.current = controller; setState(beginAuditLoadMore);
    try { const page = await requestAudit(serializeAuditRequestQuery({ ...state.filters, cursor }), controller.signal); if (!controller.signal.aborted && generation.current === requestGeneration && moreController.current === controller) setState((current) => succeedAuditLoadMore(current, page)); }
    catch { if (!controller.signal.aborted && generation.current === requestGeneration && moreController.current === controller) setState(failAuditLoadMore); }
    finally { if (moreController.current === controller) { moreController.current = null; moreInFlight.current = false; } }
  };

  const filterContent = <form className="audit-secondary-form" onSubmit={applySecondary} aria-label={t("audit.filters.label")}>
    <label htmlFor="audit-event-type">{t("audit.filters.eventType")}</label><Select id="audit-event-type" value={secondary.eventType || undefined} allowClear placeholder={t("common.all")} onChange={(value) => setSecondary((current) => ({ ...current, eventType: value ?? "" }))} options={AUDIT_EVENT_TYPES.map((value) => ({ value, label: auditEventLabel(value, locale) }))} />
    <label htmlFor="audit-actor-type">{t("audit.filters.actor")}</label><Select id="audit-actor-type" value={secondary.actorType || undefined} allowClear placeholder={t("common.all")} onChange={(value) => setSecondary((current) => ({ ...current, actorType: value ?? "" }))} options={AUDIT_ACTOR_TYPES.map((value) => ({ value, label: value === "USER" ? t("audit.actor.user") : t("audit.actor.system") }))} />
    <label htmlFor="audit-target-type">{t("audit.filters.targetType")}</label><Select id="audit-target-type" value={secondary.targetType || undefined} allowClear placeholder={t("common.all")} onChange={(value) => setSecondary((current) => ({ ...current, targetType: value ?? "" }))} options={AUDIT_TARGET_TYPES.map((value) => ({ value, label: auditTargetTypeLabel(value, locale) }))} />
    <Flex gap="small" justify="end"><Button onClick={() => { setSecondary(secondaryDraft(state.filters)); setFilterOpen(false); }}>{t("common.cancel")}</Button><Button type="primary" htmlType="submit">{t("audit.filters.apply")}</Button></Flex>
  </form>;

  return <div className="admin-audit-page">
    <header className="audit-page-heading"><div><CompactPageHeading title={t("audit.title")} subtitle={t("audit.description")} /></div><StableLoadingButton idleLabel={t("common.refresh")} loadingLabel={t("common.refreshing")} loading={state.refreshing} icon={<ReloadOutlined aria-hidden />} onClick={refresh} /></header>
    {navigation}
    {isMobile && selected ? <div ref={mobileDetail} className="audit-mobile-detail"><AuditEventDetail item={selected} mobile onBack={back} idPrefix="mobile" /></div> : <>
      <section className="audit-controls" aria-label={t("audit.time.label")}>
        <div className="audit-period-context">
          <Typography.Text strong id="audit-period-label">{t("audit.time.label")}</Typography.Text>
          <PeriodPopover open={periodOpen} onOpenChange={(open) => { setPeriodOpen(open); if (open) { setFromDraft(localTime(state.filters.from)); setToDraft(localTime(state.filters.to)); setFilterError(false); setFilterOpen(false); } }} width={360} title={t("audit.time.label")} className="audit-period-popover" content={
            <form id="audit-period-editor" className="audit-period-form" onSubmit={applyTime} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); closePeriod(); } }}>
              <label htmlFor="audit-from">{t("audit.filters.from")}</label>
              <DatePicker id="audit-from" classNames={{ popup: { root: "audit-date-popup" } }} defaultPickerValue={dayjs.utc()} showTime={{ format: "HH:mm" }} format="DD.MM.YYYY HH:mm" value={fromDraft ? dayjs.utc(fromDraft) : null} onChange={(value) => setFromDraft(value?.format("YYYY-MM-DDTHH:mm") ?? "")} showNow={false} inputReadOnly aria-describedby="audit-period-timezone" />
              <label htmlFor="audit-to">{t("audit.filters.to")}</label>
              <DatePicker id="audit-to" classNames={{ popup: { root: "audit-date-popup" } }} defaultPickerValue={dayjs.utc()} showTime={{ format: "HH:mm" }} format="DD.MM.YYYY HH:mm" value={toDraft ? dayjs.utc(toDraft) : null} onChange={(value) => setToDraft(value?.format("YYYY-MM-DDTHH:mm") ?? "")} showNow={false} inputReadOnly aria-describedby="audit-period-timezone" />
              <Typography.Text id="audit-period-timezone" type="secondary">{t("track.controls.timezone")}</Typography.Text>
              {filterError && <Alert type="error" showIcon title={t("audit.filters.invalid")} />}
              <Flex wrap gap="small" justify="end"><Button onClick={allHistory}>{t("audit.time.allHistory")}</Button><Button onClick={closePeriod}>{t("common.cancel")}</Button><Button type="primary" htmlType="submit">{t("audit.filters.apply")}</Button></Flex>
            </form>
          }>
            <Button ref={periodTrigger} size="large" className="audit-period-trigger" icon={<CalendarOutlined aria-hidden />} aria-labelledby="audit-period-label audit-period-summary" aria-expanded={periodOpen} aria-controls="audit-period-editor"><span id="audit-period-summary">{timeSummary}</span><DownOutlined aria-hidden /></Button>
          </PeriodPopover>
        </div>
        <Popover open={filterOpen} onOpenChange={(open) => { setFilterOpen(open); if (open) { setSecondary(secondaryDraft(state.filters)); setPeriodOpen(false); } }} trigger="click" placement="bottomRight" arrow={false} title={t("audit.filters.secondaryTitle")} content={filterContent} destroyOnHidden>
          <Button size="large" icon={<FilterOutlined aria-hidden />} aria-expanded={filterOpen}>{t("audit.filters.action", { count: secondaryCount })}</Button>
        </Popover>
      </section>
      {secondaryCount > 0 && <section className="audit-filter-chips" aria-label={t("audit.filters.applied")}>{state.filters.eventType && <Tag closable onClose={(event) => { event.preventDefault(); removeSecondary("eventType"); }} closeIcon={<span aria-label={t("audit.filters.remove", { filter: auditEventLabel(state.filters.eventType, locale) })}>×</span>}>{auditEventLabel(state.filters.eventType, locale)}</Tag>}{state.filters.actorType && <Tag closable onClose={(event) => { event.preventDefault(); removeSecondary("actorType"); }} closeIcon={<span aria-label={t("audit.filters.remove", { filter: state.filters.actorType === "USER" ? t("audit.actor.user") : t("audit.actor.system") })}>×</span>}>{state.filters.actorType === "USER" ? t("audit.actor.user") : t("audit.actor.system")}</Tag>}{state.filters.targetType && <Tag closable onClose={(event) => { event.preventDefault(); removeSecondary("targetType"); }} closeIcon={<span aria-label={t("audit.filters.remove", { filter: auditTargetTypeLabel(state.filters.targetType, locale) })}>×</span>}>{auditTargetTypeLabel(state.filters.targetType, locale)}</Tag>}</section>}
      <section className="audit-workspace" aria-labelledby="audit-chronology-title">
        <div className="audit-chronology" aria-busy={state.loading || state.moreLoading}>
          <div className="audit-chronology__heading"><Typography.Title id="audit-chronology-title" level={2}>{t("audit.chronology")}</Typography.Title>{state.refreshing && <Typography.Text type="secondary" role="status">{t("audit.loading")}</Typography.Text>}</div>
          {state.error === "refresh" && <Alert type="error" showIcon title={t("audit.refreshError")} action={<Button size="small" onClick={refresh}>{t("common.retry")}</Button>} />}
          {state.loading && state.data.items.length === 0 ? <div className="audit-initial-loading" role="status" aria-label={t("audit.loading")}><Skeleton active paragraph={{ rows: 3 }} /><Skeleton active paragraph={{ rows: 3 }} /></div> : state.error === "first" ? <Alert type="error" showIcon title={t("audit.loadError")} action={<Button size="small" onClick={() => void loadFirst(state.filters)}>{t("common.retry")}</Button>} /> : state.initialized && state.data.items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Space orientation="vertical"><Typography.Text strong>{t(hasAuditFilters(state.filters) ? "audit.noResultsTitle" : "audit.noHistoryTitle")}</Typography.Text><Typography.Text type="secondary">{t(hasAuditFilters(state.filters) ? "audit.noResultsText" : "audit.noHistoryText")}</Typography.Text></Space>} /> : <AuditEventTable items={state.data.items} selectedId={selectedId} onSelect={selectEvent} showInlineDetails={screens.md === true && screens.lg === false} />}
          {(state.data.hasMore || state.moreLoading || state.error === "more") && <div className="audit-pagination">{state.error === "more" && <Alert type="error" showIcon title={t("audit.loadMoreError")} action={<Button size="small" onClick={() => void loadMore()}>{t("common.retry")}</Button>} />}<Button size="large" loading={state.moreLoading} disabled={state.error === "more"} onClick={() => void loadMore()}>{t("audit.loadMore")}</Button></div>}
        </div>
        <aside className={`audit-desktop-inspector${selected ? "" : " audit-desktop-inspector--empty"}`} aria-label={t("audit.selectedEvent")}>{selected ? <AuditEventDetail item={selected} /> : <Typography.Paragraph type="secondary">{t("audit.selectPrompt")}</Typography.Paragraph>}</aside>
      </section>
    </>}
  </div>;
}
