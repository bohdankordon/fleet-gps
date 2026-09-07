"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Alert, Button, DatePicker, Drawer, Empty, Grid, Popover, Segmented, Select, Skeleton, Tag, Typography, theme } from "antd";
import { CalendarOutlined, DownOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import type { AlertEventsListResponse, AlertEventsSummaryResponse, AlertEventsVehicleOptions } from "../lib/alert-events/alert-events-contract";
import { parseAlertEventsListResponse, parseAlertEventsSummaryResponse, parseAlertEventsVehicleOptions } from "../lib/alert-events/alert-events-contract";
import { alertStatusLabel, alertTypeLabel, alertZoneLabel, formatAlertDistance, formatAlertSpeed, formatAlertTimestamp } from "../lib/alert-events/alert-events-formatters";
import { alertEventsHistoryPath, shouldUpdateAlertEventsHistory, type AlertEventsNavigationReason } from "../lib/alert-events/alert-events-navigation";
import { ALERT_EVENTS_PAGE_SIZE, alertEventsMode, alertEventsPreset, switchAlertEventsMode, parseAlertEventsFilters, serializeAlertEventsRequestQuery, type AlertEventsFilters, type AlertEventsMode, type AlertEventsPeriod } from "../lib/alert-events/alert-events-query";
import { type AlertEventsListState, abortAlertEventsLoadMore, beginAlertEventsFirstPage, beginAlertEventsLoadMore, canLoadMoreAlertEvents, failAlertEventsFirstPage, failAlertEventsLoadMore, initialAlertEventsListState, isCurrentAlertEventsGeneration, succeedAlertEventsFirstPage, succeedAlertEventsLoadMore } from "../lib/alert-events/alert-events-request-state";
import { absoluteToKyivLocal, kyivLocalToAbsolute, vehicleTrackCustomRangeErrorCopy } from "../lib/vehicle-track/vehicle-track-custom-range";
import { TRIP_ANALYSIS_CIVIL_FORMAT, TRIP_ANALYSIS_PICKER_FORMAT, tripAnalysisPickerValueToCivil } from "../lib/trip-analysis/trip-analysis-range";
import { formatUnit } from "../i18n/formatting";
import { useI18n } from "../i18n/client";
import { EventDetail } from "./event-detail";

dayjs.extend(customParseFormat);
type Props = Readonly<{ initialData: AlertEventsListResponse; initialSummary: AlertEventsSummaryResponse | null; initialFilters: AlertEventsFilters; initialError?: boolean }>;
async function bffJson(path: string, signal: AbortSignal): Promise<unknown> { const response = await fetch(path, { cache: "no-store", signal }); if (!response.ok) throw new Error(); return response.json(); }

export function EventsClient({ initialData, initialSummary, initialFilters, initialError = false }: Props) {
  const { locale, t } = useI18n(); const { token } = theme.useToken(); const screens = Grid.useBreakpoint();
  const [list, setList] = useState<AlertEventsListState>(() => ({ ...initialAlertEventsListState(initialData, initialFilters), error: initialError ? "first" as const : null }));
  const [summary, setSummary] = useState(initialSummary); const [summaryError, setSummaryError] = useState(initialSummary === null);
  const [vehicles, setVehicles] = useState<AlertEventsVehicleOptions>([]); const [vehiclesLoading, setVehiclesLoading] = useState(true); const [vehiclesError, setVehiclesError] = useState(false);
  const selectionTrigger = useRef<HTMLButtonElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null); const [selectionTime, setSelectionTime] = useState(() => new Date());
  const closeSelection = () => { setSelectedId(null); queueMicrotask(() => selectionTrigger.current?.focus({ preventScroll: true })); };
  const primaryController = useRef<AbortController | null>(null); const moreController = useRef<AbortController | null>(null); const moreInFlight = useRef(false); const generation = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    bffJson("/api/alert-events/vehicles", controller.signal).then((data) => { if (!controller.signal.aborted) setVehicles(parseAlertEventsVehicleOptions(data)); }).catch(() => { if (!controller.signal.aborted) setVehiclesError(true); }).finally(() => { if (!controller.signal.aborted) setVehiclesLoading(false); });
    return () => controller.abort();
  }, []);
  const firstRequest = useCallback(async (next: AlertEventsFilters, reason: AlertEventsNavigationReason) => {
    primaryController.current?.abort(); moreController.current?.abort(); moreController.current = null; moreInFlight.current = false;
    const requestGeneration = generation.current + 1; generation.current = requestGeneration; const controller = new AbortController(); primaryController.current = controller;
    if (reason === "user" || reason === "popstate") setSelectedId(null);
    setList((current) => abortAlertEventsLoadMore(beginAlertEventsFirstPage(current, next)));
    if (shouldUpdateAlertEventsHistory(reason)) window.history.pushState(null, "", alertEventsHistoryPath(next));
    const query = serializeAlertEventsRequestQuery({ ...next, limit: ALERT_EVENTS_PAGE_SIZE }); const [listResult, summaryResult] = await Promise.allSettled([bffJson(`/api/alert-events?${query}`, controller.signal), bffJson("/api/alert-events/summary", controller.signal)]);
    if (controller.signal.aborted || !isCurrentAlertEventsGeneration(requestGeneration, generation.current)) return;
    if (listResult.status === "fulfilled") { try { const data = parseAlertEventsListResponse(listResult.value); setSelectedId((id) => data.items.some((event) => event.id === id) ? id : null); setList((current) => succeedAlertEventsFirstPage(current, next, data)); } catch { setList(failAlertEventsFirstPage); } } else setList(failAlertEventsFirstPage);
    if (summaryResult.status === "fulfilled") { try { setSummary(parseAlertEventsSummaryResponse(summaryResult.value)); setSummaryError(false); } catch { setSummaryError(true); } } else setSummaryError(true);
  }, []);

  useEffect(() => { const onPopState = () => { try { void firstRequest(parseAlertEventsFilters(new URLSearchParams(window.location.search)), "popstate"); } catch { window.history.replaceState(null, "", "/events"); void firstRequest(parseAlertEventsFilters(new URLSearchParams()), "popstate"); } }; window.addEventListener("popstate", onPopState); return () => { window.removeEventListener("popstate", onPopState); primaryController.current?.abort(); moreController.current?.abort(); moreInFlight.current = false; }; }, [firstRequest]);
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
  const mode = alertEventsMode(list.filters);
  const selected = list.data.items.find((event) => event.id === selectedId) ?? null;
  const filterCount = Number(Boolean(list.filters.type)) + Number(Boolean(list.filters.vehicleId)) + Number(mode === "history" && list.filters.period !== "7d");
  const emptyKey = list.filters.type || list.filters.vehicleId ? "events.empty.filteredTitle" : mode === "history" ? "events.empty.history" : "events.empty.active";
  const shortcut = (type?: AlertEventsFilters["type"]) => void firstRequest({ ...switchAlertEventsMode(list.filters, "active"), type }, "user");
  const variables = { "--events-bg": token.colorBgContainer, "--events-border": token.colorBorderSecondary, "--events-muted": token.colorTextSecondary, "--events-fill": token.colorFillAlter, "--events-selected": token.controlItemBgActive, "--events-primary": token.colorPrimary, "--events-radius": `${token.borderRadiusLG}px` } as CSSProperties;
  const vehicleOptions = vehicles.map((vehicle) => ({ value: vehicle.vehicleId, label: vehicle.vehicleName }));
  if (list.filters.vehicleId && !vehicleOptions.some((v) => v.value === list.filters.vehicleId)) vehicleOptions.push({ value: list.filters.vehicleId, label: list.data.items.find((event) => event.vehicle.id === list.filters.vehicleId)?.vehicle.name ?? initialData.items.find((event) => event.vehicle.id === list.filters.vehicleId)?.vehicle.name ?? t("events.table.vehicle") });

  return <div className="events-page" style={variables}>
    <header className="events-heading"><div><Typography.Title level={1} style={{ margin: 0, fontSize: 24 }}>{t("events.title")}</Typography.Title><Typography.Text type="secondary">{t("events.description")}</Typography.Text></div><Button icon={<ReloadOutlined aria-hidden />} loading={list.loading} onClick={() => void firstRequest(list.filters, "refresh")}>{t("common.refresh")}</Button></header>
    <section className="events-metrics" aria-label={t("events.openNow")}>
      {([{ label: t("events.openNow"), value: summary?.open.total, type: undefined }, { label: t("events.summary.speeding"), value: summary?.open.speeding, type: "SPEEDING" }, { label: t("events.type.INACTIVITY"), value: summary?.open.inactivity, type: "INACTIVITY" }] as const).map((metric) => <button type="button" className="events-metric" key={metric.label} onClick={() => shortcut(metric.type)}><span>{metric.label}</span><strong>{summaryError ? "—" : metric.value ?? "—"}</strong></button>)}
      <span className="events-metrics__scope">{t("events.summary.scope")}</span>
    </section>
    {summaryError && <Alert type="warning" showIcon title={t("events.summaryError")} action={<Button size="small" onClick={() => void firstRequest(list.filters, "refresh")}>{t("common.retry")}</Button>} />}
    <div className="events-controls">
      <Segmented aria-label={t("events.title")} value={mode} options={[{ label: t("events.mode.active"), value: "active" }, { label: t("events.mode.history"), value: "history" }]} onChange={(value) => void firstRequest(switchAlertEventsMode(list.filters, value as AlertEventsMode), "user")} />
      {mode === "history" && <EventsPeriod key={`${list.filters.from}/${list.filters.to}`} filters={list.filters} onApply={(range) => void firstRequest({ ...list.filters, ...range }, "user")} />}
      <section className="events-toolbar" aria-label={t("events.filters.label")}>
        <div className="events-filter"><label htmlFor="events-type">{t("events.filters.type")}</label><Select id="events-type" value={list.filters.type ?? "ALL"} options={[{ value: "ALL", label: t("common.all") }, { value: "SPEEDING", label: t("events.type.SPEEDING") }, { value: "INACTIVITY", label: t("events.type.INACTIVITY") }]} onChange={(value) => change("type", value === "ALL" ? undefined : value as AlertEventsFilters["type"])} /></div>
        <div className="events-filter"><label htmlFor="events-vehicle">{t("events.table.vehicle")}</label><Select id="events-vehicle" showSearch={{ optionFilterProp: "label" }} allowClear placeholder={t("common.all")} loading={vehiclesLoading} value={list.filters.vehicleId} options={vehicleOptions} onChange={(value) => change("vehicleId", value)} /></div>
        <Typography.Text className="events-filter-count" type="secondary">{t("events.filterCount", { count: filterCount })}</Typography.Text>
        <Button disabled={filterCount === 0} onClick={() => void firstRequest(switchAlertEventsMode({}, mode), "user")}>{t("audit.filters.reset")}</Button>
      </section>
      {vehiclesError && <Alert type="warning" showIcon title={t("events.vehiclesError")} />}
    </div>
    <section className="events-workspace" aria-label={t("events.chronology")}>
      <div className="events-chronology" aria-busy={list.loading || list.moreLoading}>
        <div className="events-chronology__heading"><Typography.Text strong>{t(mode === "active" ? "events.mode.active" : "events.mode.history")}</Typography.Text>{list.loading && list.data.items.length > 0 && <Typography.Text type="secondary" role="status">{t("events.loading")}</Typography.Text>}</div>
        {list.error && <Alert type="error" showIcon title={t(list.error === "more" ? "events.loadMoreError" : "events.loadError")} action={<Button size="small" onClick={retry}>{t("common.retry")}</Button>} />}
        {list.loading && list.data.items.length === 0 ? <div className="events-loading" role="status" aria-label={t("common.loading")}><Skeleton active paragraph={{ rows: 3 }} /><Skeleton active paragraph={{ rows: 3 }} /></div> : list.data.items.length === 0 ? !list.error && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(emptyKey)} /> : <ul className="events-list">{list.data.items.map((event) => <li key={event.id}><button type="button" className="events-item" aria-pressed={selectedId === event.id} onClick={(click) => { selectionTrigger.current = click.currentTarget; setSelectionTime(new Date()); setSelectedId(event.id); }}>
          <span className="events-item__top"><strong>{event.vehicle.name}</strong><Tag color={event.status === "OPEN" ? "blue" : "default"}>{alertStatusLabel(event.status, locale)}</Tag></span>
          <span className="events-item__type">{alertTypeLabel(event.type, locale)}</span>
          <span className="events-item__time"><time dateTime={event.openedAt}>{formatAlertTimestamp(event.openedAt, locale)}</time>{event.type === "SPEEDING" && ` · ${alertZoneLabel(event.details.zone, locale)}`}</span>
          <span className="events-item__evidence"><strong>{event.type === "SPEEDING" ? formatAlertSpeed(event.details.confirmationSpeedKph, locale) : formatAlertDistance(event.details.confirmationDistanceMeters, locale)}</strong><span>{event.type === "SPEEDING" ? t("events.list.speeding", { threshold: formatAlertSpeed(event.details.thresholdKph, locale), peak: formatAlertSpeed(event.details.peakSpeedKph, locale) }) : t("events.list.inactivity", { threshold: formatAlertDistance(event.details.distanceThresholdMeters, locale), window: formatUnit(locale, event.details.durationThresholdMinutes, "minute") })}</span></span>
        </button></li>)}</ul>}
        {(canLoadMoreAlertEvents(list) || list.moreLoading) && <div className="events-more"><Button loading={list.moreLoading} onClick={() => void loadMore()}>{t("audit.loadMore")}</Button></div>}
      </div>
      {screens.lg && <aside className="events-context">{selected ? <EventDetail event={selected} now={selectionTime} onClose={closeSelection} /> : <div className="events-context__empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("events.empty.selection")} /></div>}</aside>}
    </section>
    {!screens.lg && <Drawer focusable={{ focusTriggerAfterClose: false }} afterOpenChange={(open) => { if (!open) selectionTrigger.current?.focus({ preventScroll: true }); }} title={t("events.detail")} open={selected !== null} onClose={closeSelection} size={screens.md ? 520 : "100%"} destroyOnHidden styles={{ body: { padding: 0, ...variables } }}>{selected && <EventDetail event={selected} now={selectionTime} onClose={closeSelection} />}</Drawer>}
  </div>;
}

function EventsPeriod({ filters, onApply }: Readonly<{ filters: AlertEventsFilters; onApply: (range: Pick<AlertEventsFilters, "from" | "to" | "period">) => void }>) {
  const { locale, t } = useI18n(); const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from: absoluteToKyivLocal(filters.from ?? "") ?? "", to: absoluteToKyivLocal(filters.to ?? "") ?? "" });
  const [error, setError] = useState<string | null>(null);
  const picker = (value: string) => value ? dayjs(value, TRIP_ANALYSIS_CIVIL_FORMAT, true) : null;
  const apply = () => {
    const from = kyivLocalToAbsolute(draft.from); const to = kyivLocalToAbsolute(draft.to);
    const invalid = from.error ?? to.error ?? (from.instant! >= to.instant! ? "ORDER" : null);
    if (invalid) { setError(vehicleTrackCustomRangeErrorCopy(invalid, locale)); return; }
    onApply({ from: from.instant!, to: to.instant!, period: "custom" }); setOpen(false);
  };
  const editor = <div className="events-period-editor"><div className="event-detail__actions">{(["24h", "7d", "30d"] as const).map((period) => <Button key={period} type={filters.period === period ? "primary" : "default"} onClick={() => { onApply(alertEventsPreset(period)); setOpen(false); }}>{t(`events.period.${period}`)}</Button>)}</div><Typography.Text strong>{t("events.period.custom")}</Typography.Text><DatePicker.RangePicker aria-label={t("events.period")} value={[picker(draft.from), picker(draft.to)]} onCalendarChange={(values) => setDraft({ from: tripAnalysisPickerValueToCivil(values[0]), to: tripAnalysisPickerValueToCivil(values[1]) })} onChange={(values) => setDraft({ from: tripAnalysisPickerValueToCivil(values?.[0] ?? null), to: tripAnalysisPickerValueToCivil(values?.[1] ?? null) })} order={false} needConfirm showTime={{ format: "HH:mm" }} format={TRIP_ANALYSIS_PICKER_FORMAT} placeholder={[t("track.controls.from"), t("track.controls.to")]} styles={{ popup: { root: { maxWidth: "calc(100vw - 24px)", overflowX: "auto" } } }} />{error && <Alert type="error" title={error} />}<Button type="primary" onClick={apply}>{t("track.controls.showPeriod")}</Button><Typography.Text type="secondary">{t("events.period.help")}</Typography.Text></div>;
  return <div className="events-period"><Popover content={editor} trigger="click" open={open} onOpenChange={setOpen} placement="bottomLeft"><Button icon={<CalendarOutlined aria-hidden />} aria-expanded={open}>{t("events.period")} · {t(`events.period.${filters.period ?? "7d"}` as `events.period.${AlertEventsPeriod}`)} <DownOutlined aria-hidden /></Button></Popover><Typography.Text type="secondary">{formatAlertTimestamp(filters.from ?? null, locale)} → {formatAlertTimestamp(filters.to ?? null, locale)} · Europe/Kyiv</Typography.Text></div>;
}
