"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Alert, Button, DatePicker, Drawer, Grid, Divider, Flex, Tabs, Select, Skeleton, Typography, theme } from "antd";
import { AlertOutlined, CalendarOutlined, DownOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import type { AlertEventsListResponse, AlertEventsSummaryResponse, AlertEventsVehicleOptions } from "../lib/alert-events/alert-events-contract";
import { parseAlertEventsListResponse, parseAlertEventsSummaryResponse, parseAlertEventsVehicleOptions } from "../lib/alert-events/alert-events-contract";
import { alertTypeLabel, alertZoneLabel, formatAlertDistance, formatAlertSpeed, formatAlertTimestamp } from "../lib/alert-events/alert-events-formatters";
import { alertEventsHistoryPath, shouldUpdateAlertEventsHistory, type AlertEventsNavigationReason } from "../lib/alert-events/alert-events-navigation";
import { ALERT_EVENTS_PAGE_SIZE, alertEventsMode, alertEventsPreset, switchAlertEventsMode, parseAlertEventsFilters, serializeAlertEventsRequestQuery, type AlertEventsFilters, type AlertEventsMode, type AlertEventsPeriod } from "../lib/alert-events/alert-events-query";
import { type AlertEventsListState, abortAlertEventsLoadMore, beginAlertEventsFirstPage, beginAlertEventsLoadMore, canLoadMoreAlertEvents, failAlertEventsFirstPage, failAlertEventsLoadMore, initialAlertEventsListState, isCurrentAlertEventsGeneration, succeedAlertEventsFirstPage, succeedAlertEventsLoadMore } from "../lib/alert-events/alert-events-request-state";
import { absoluteToKyivLocal, kyivLocalToAbsolute, vehicleTrackCustomRangeErrorCopy } from "../lib/vehicle-track/vehicle-track-custom-range";
import { TRIP_ANALYSIS_CIVIL_FORMAT, TRIP_ANALYSIS_PICKER_FORMAT, tripAnalysisPickerValueToCivil } from "../lib/trip-analysis/trip-analysis-range";
import { formatUnit } from "../i18n/formatting";
import { useI18n } from "../i18n/client";
import { PeriodPopover } from "./period-popover";
import { CompactPageHeading } from "./compact-page-heading";
import { FleetFilterResetButton } from "./fleet-filter-reset-button";
import { PRODUCT_GROUP_FILTER_ALL, PRODUCT_GROUP_FILTER_UNGROUPED, productGroupOptionsFromVehicles } from "../lib/vehicle-groups/vehicle-groups-contract";
import { eventSemanticPresentation } from "./event-semantic-presentation";
import { EventDetail } from "./event-detail";
import { StableLoadingButton } from "./stable-loading-button";
import { EventStatusTag, EventTypeIcon, EventsEmpty } from "./events-presentation";

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
  const filterCount = Number(Boolean(list.filters.type)) + Number(Boolean(list.filters.vehicleId)) + Number(Boolean(list.filters.group)) + Number(mode === "history" && list.filters.period !== "7d");
  const emptyKey = list.filters.type || list.filters.vehicleId || list.filters.group ? "events.empty.filteredTitle" : mode === "history" ? "events.empty.history" : "events.empty.active";
  const shortcut = (type?: AlertEventsFilters["type"]) => void firstRequest({ ...switchAlertEventsMode(list.filters, "active"), type }, "user");
  // Consume the accepted Fleet/Vehicle-family theme and owned CSS contracts locally.
  const variables = {
    fontFamily: token.fontFamily, fontSize: token.fontSize, color: token.colorText,
    "--events-bg": token.colorBgContainer, "--events-border": token.colorBorder, "--events-divider": token.colorBorderSecondary,
    "--events-muted": token.colorTextSecondary, "--events-fill": token.colorFillQuaternary, "--events-primary": token.colorPrimary,
    "--events-radius": `${token.borderRadiusLG}px`,
    "--trip-surface-bg": token.colorBgContainer, "--trip-surface-border": token.colorBorder, "--trip-surface-radius": `${token.borderRadiusLG}px`,
    "--trip-summary-divider": token.colorBorderSecondary,
    "--trip-record-bg": token.colorFillQuaternary, "--trip-record-hover": token.colorFillTertiary,
    "--trip-record-selected": token.colorPrimaryBg, "--trip-record-selected-border": token.colorPrimaryBorder,
    "--trip-record-radius": `${token.borderRadiusLG}px`, "--trip-record-padding": `${token.paddingSM}px`,
    "--trip-record-accent": token.colorPrimary,
  } as CSSProperties;
  const vehicleOptions = vehicles.map((vehicle) => ({ value: vehicle.vehicleId, label: vehicle.vehicleName }));
  const eventGroupMeta = productGroupOptionsFromVehicles(vehicles.map((vehicle) => ({ group: vehicle.group })));
  const eventGroupOptions = [{ value: PRODUCT_GROUP_FILTER_ALL, label: t("group.filter.allGroups") }, ...eventGroupMeta.options.map((option) => ({ value: option.id, label: option.name })), ...(eventGroupMeta.hasUngrouped ? [{ value: PRODUCT_GROUP_FILTER_UNGROUPED, label: t("group.ungrouped") }] : [])];
  const showEventGroupFilter = eventGroupMeta.options.length > 0 || eventGroupMeta.hasUngrouped;
  if (list.filters.vehicleId && !vehicleOptions.some((v) => v.value === list.filters.vehicleId)) vehicleOptions.push({ value: list.filters.vehicleId, label: list.data.items.find((event) => event.vehicle.id === list.filters.vehicleId)?.vehicle.name ?? initialData.items.find((event) => event.vehicle.id === list.filters.vehicleId)?.vehicle.name ?? t("events.table.vehicle") });

  return <div className="events-page" style={variables}>
    <header className="events-heading"><div className="map-page__header"><CompactPageHeading title={t("events.title")} subtitle={t("events.description")} /></div><StableLoadingButton idleLabel={t("common.refresh")} loadingLabel={t("common.refreshing")} icon={<ReloadOutlined aria-hidden />} loading={list.loading} size="large" type="default" onClick={() => void firstRequest(list.filters, "refresh")} /></header>
    <section className="events-metrics vehicle-trips__summary" aria-label={t("events.openNow")}>
      {([{ label: t("events.openNow"), value: summary?.open.total, type: undefined }, { label: t("events.summary.speeding"), value: summary?.open.speeding, type: "SPEEDING" }, { label: t("events.type.INACTIVITY"), value: summary?.open.inactivity, type: "INACTIVITY" }] as const).map((metric) => <button type="button" className="events-metric vehicle-trips__summary-metric" aria-pressed={mode === "active" && list.filters.type === metric.type} key={metric.label} onClick={() => shortcut(metric.type)}><span className="vehicle-trips__summary-icon" style={{ color: token.colorPrimary }}>{metric.type ? <EventTypeIcon type={metric.type} /> : <AlertOutlined aria-hidden />}</span><span className="vehicle-trips__summary-content"><Typography.Text className="vehicle-trips__summary-title">{metric.label}</Typography.Text><Typography.Text className="vehicle-trips__summary-value" strong>{summaryError ? "—" : metric.value ?? "—"}</Typography.Text></span></button>)}
      <span className="events-metrics__scope">{t("events.summary.scope")}</span>
    </section>
    {summaryError && <Alert type="warning" showIcon title={t("events.summaryError")} action={<Button size="small" onClick={() => void firstRequest(list.filters, "refresh")}>{t("common.retry")}</Button>} />}
    <div className="events-controls">
      <Tabs className="events-modes vehicle-detail-shell__tabs" aria-label={t("events.title")} activeKey={mode} animated={false} styles={{ header: { margin: 0 }, body: { display: "none" } }} items={[{ label: t("events.mode.active"), key: "active" }, { label: t("events.mode.history"), key: "history" }]} onChange={(value) => void firstRequest(switchAlertEventsMode(list.filters, value as AlertEventsMode), "user")} />
      {mode === "history" && <EventsPeriod key={`${list.filters.from}/${list.filters.to}`} filters={list.filters} onApply={(range) => void firstRequest({ ...list.filters, ...range }, "user")} />}
      <section className="events-toolbar fleet-toolbar" aria-label={t("events.filters.label")}>
        <div className="events-filter"><label htmlFor="events-type">{t("events.filters.type")}</label><Select size="large" className="fleet-toolbar__select-control" id="events-type" value={list.filters.type ?? "ALL"} options={[{ value: "ALL", label: t("common.all") }, { value: "SPEEDING", label: t("events.type.SPEEDING") }, { value: "INACTIVITY", label: t("events.type.INACTIVITY") }]} onChange={(value) => change("type", value === "ALL" ? undefined : value as AlertEventsFilters["type"])} /></div>
        <div className="events-filter"><label htmlFor="events-vehicle">{t("events.table.vehicle")}</label><Select size="large" className="fleet-toolbar__select-control" id="events-vehicle" showSearch={{ optionFilterProp: "label" }} allowClear placeholder={t("common.all")} loading={vehiclesLoading} value={list.filters.vehicleId} options={vehicleOptions} onChange={(value) => change("vehicleId", value)} /></div>
        {showEventGroupFilter ? <div className="events-filter"><label htmlFor="events-group">{t("group.filter.label")}</label><Select size="large" className="fleet-toolbar__select-control" id="events-group" value={list.filters.group ?? "ALL"} options={eventGroupOptions} onChange={(value) => change("group", value === "ALL" ? undefined : value)} /></div> : null}
        <div className="events-filter-utility"><Typography.Text className="events-filter-count" type="secondary">{t("events.filterCount", { count: filterCount })}</Typography.Text>
        <FleetFilterResetButton disabled={filterCount === 0} onClick={() => void firstRequest(switchAlertEventsMode({}, mode), "user")}>{t("dashboard.toolbar.resetFilters")}</FleetFilterResetButton></div>
      </section>
      {vehiclesError && <Alert type="warning" showIcon title={t("events.vehiclesError")} />}
    </div>
    <section className="events-workspace" aria-label={t("events.chronology")}>
      <div className="events-chronology" aria-busy={list.loading || list.moreLoading}>
        <div className="events-chronology__heading vehicle-trips__workspace-header"><Typography.Text className="vehicle-overview__section-title"><CalendarOutlined className="vehicle-overview__section-icon" style={{ color: token.colorPrimary }} aria-hidden /> {t(mode === "active" ? "events.mode.active" : "events.mode.history")}</Typography.Text>{list.loading && list.data.items.length > 0 && <Typography.Text type="secondary" role="status">{t("events.loading")}</Typography.Text>}</div>
        {list.error && <Alert type="error" showIcon title={t(list.error === "more" ? "events.loadMoreError" : "events.loadError")} action={<Button size="small" onClick={retry}>{t("common.retry")}</Button>} />}
        {list.loading && list.data.items.length === 0 ? <div className="events-loading" role="status" aria-label={t("common.loading")}><Skeleton active paragraph={{ rows: 3 }} /><Skeleton active paragraph={{ rows: 3 }} /></div> : list.data.items.length === 0 ? !list.error && <EventsEmpty description={t(emptyKey)} /> : <ul className="events-list">{list.data.items.map((event) => <li key={event.id} style={{ "--trip-record-accent": eventSemanticPresentation(event, token).accent } as CSSProperties} className={`vehicle-trips__record${selectedId === event.id ? " vehicle-trips__record--selected" : ""}`}><span className="vehicle-trips__record-marker"><span className="vehicle-trips__record-icon">{eventSemanticPresentation(event, token).marker}</span></span><button type="button" className="events-item vehicle-trips__record-button" aria-pressed={selectedId === event.id} onClick={(click) => { selectionTrigger.current = click.currentTarget; setSelectionTime(new Date()); setSelectedId(event.id); }}>
          <span className="events-item__top"><strong>{event.vehicle.name}</strong><EventStatusTag status={event.status} /></span>
          <span className="events-item__type">{alertTypeLabel(event.type, locale)}</span>
          <span className="events-item__time"><time dateTime={event.openedAt}>{formatAlertTimestamp(event.openedAt, locale)}</time>{event.type === "SPEEDING" && ` · ${alertZoneLabel(event.details.zone, locale)}`}</span>
          <span className="events-item__evidence"><strong>{event.type === "SPEEDING" ? formatAlertSpeed(event.details.confirmationSpeedKph, locale) : formatAlertDistance(event.details.confirmationDistanceMeters, locale)}</strong><span>{event.type === "SPEEDING" ? t("events.list.speeding", { threshold: formatAlertSpeed(event.details.thresholdKph, locale), peak: formatAlertSpeed(event.details.peakSpeedKph, locale) }) : t("events.list.inactivity", { threshold: formatAlertDistance(event.details.distanceThresholdMeters, locale), window: formatUnit(locale, event.details.durationThresholdMinutes, "minute") })}</span></span>
        </button></li>)}</ul>}
        {(canLoadMoreAlertEvents(list) || list.moreLoading) && <div className="events-more"><Button size="large" loading={list.moreLoading} onClick={() => void loadMore()}>{t("audit.loadMore")}</Button></div>}
      </div>
      {screens.lg && <aside className="events-context">{selected ? <EventDetail event={selected} now={selectionTime} onClose={closeSelection} /> : <div className="events-context__empty"><EventsEmpty description={t("events.empty.selection")} /></div>}</aside>}
    </section>
    {!screens.lg && <Drawer focusable={{ focusTriggerAfterClose: false }} afterOpenChange={(open) => { if (!open) selectionTrigger.current?.focus({ preventScroll: true }); }} title={t("events.detail")} open={selected !== null} onClose={closeSelection} size={screens.md ? 520 : "100%"} destroyOnHidden styles={{ header: { padding: token.padding, borderBottom: `1px solid ${token.colorBorderSecondary}` }, body: { padding: 0, ...variables } }}>{selected && <EventDetail event={selected} now={selectionTime} onClose={closeSelection} />}</Drawer>}
  </div>;
}

function EventsPeriod({ filters, onApply }: Readonly<{ filters: AlertEventsFilters; onApply: (range: Pick<AlertEventsFilters, "from" | "to" | "period">) => void }>) {
  const { locale, t } = useI18n(); const { token } = theme.useToken(); const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from: absoluteToKyivLocal(filters.from ?? "") ?? "", to: absoluteToKyivLocal(filters.to ?? "") ?? "" });
  const [error, setError] = useState<string | null>(null);
  const picker = (value: string) => value ? dayjs(value, TRIP_ANALYSIS_CIVIL_FORMAT, true) : null;
  const apply = () => {
    const from = kyivLocalToAbsolute(draft.from); const to = kyivLocalToAbsolute(draft.to);
    const invalid = from.error ?? to.error ?? (from.instant! >= to.instant! ? "ORDER" : null);
    if (invalid) { setError(vehicleTrackCustomRangeErrorCopy(invalid, locale)); return; }
    onApply({ from: from.instant!, to: to.instant!, period: "custom" }); setOpen(false);
  };
  const editor = <div className="vehicle-trips__period-editor">
    <Typography.Text className="vehicle-trips__editor-label" type="secondary">{t("track.controls.quick")}</Typography.Text>
    <div className="vehicle-trips__presets-section"><div className="vehicle-trips__preset-group">
      <span className="vehicle-trips__preset-group-title">{t("trips.presetGroup.recent")}</span>
      <div className="vehicle-trips__preset-grid vehicle-trips__preset-grid--3col" role="group" aria-label={t("trips.presetGroup.recent")}>
        {(["24h", "7d", "30d"] as const).map((period) => <Button size="middle" className="vehicle-trips__preset-button" key={period} aria-pressed={filters.period === period} color={filters.period === period ? "primary" : "default"} variant={filters.period === period ? "filled" : "outlined"} onClick={() => { onApply(alertEventsPreset(period)); setOpen(false); }}>{t(`events.period.${period}`)}</Button>)}
      </div>
    </div></div>
    <Divider className="vehicle-trips__editor-divider" />
    <form id="events-custom-range" className="vehicle-trips__custom-range" onSubmit={(event) => { event.preventDefault(); apply(); }}>
      <Typography.Text className="vehicle-trips__custom-title" strong>{t("track.controls.custom")}</Typography.Text>
      <div className="vehicle-trips__range-fields">
        <DatePicker.RangePicker className="vehicle-trips__range-picker" size="large" aria-label={t("events.period")} value={[picker(draft.from), picker(draft.to)]} onCalendarChange={(values) => setDraft({ from: tripAnalysisPickerValueToCivil(values[0]), to: tripAnalysisPickerValueToCivil(values[1]) })} onChange={(values) => setDraft({ from: tripAnalysisPickerValueToCivil(values?.[0] ?? null), to: tripAnalysisPickerValueToCivil(values?.[1] ?? null) })} order={false} needConfirm showTime={{ format: "HH:mm", minuteStep: 1 }} format={TRIP_ANALYSIS_PICKER_FORMAT} placeholder={[t("track.controls.from"), t("track.controls.to")]} placement="bottomLeft" classNames={{ popup: { root: "vehicle-trips__range-popup" } }} styles={{ root: { height: token.controlHeightLG }, popup: { root: { maxWidth: "calc(100vw - 48px)", overflowX: "auto" } } }} />
        <Typography.Text className="vehicle-trips__range-help" type="secondary">{t("events.period.help")}</Typography.Text>
        <Button className="vehicle-trips__show-period" htmlType="submit" size="large" type="primary" icon={<CalendarOutlined aria-hidden />}>{t("track.controls.showPeriod")}</Button>
      </div>
      {error && <Alert className="vehicle-trips__range-error" type="error" showIcon title={error} />}
    </form>
  </div>;
  return <div className="events-period vehicle-trips__period-bar"><PeriodPopover content={editor} open={open} onOpenChange={setOpen} className="vehicle-trips__period-popover" title={<Flex className="vehicle-trips__section-title" align="center" gap="small"><span className="vehicle-trips__section-icon" aria-hidden style={{ color: token.colorPrimary }}><CalendarOutlined /></span><span>{t("trips.controls.title")}</span></Flex>}><Button className="vehicle-trips__period-trigger" type="default" size="large" aria-expanded={open} aria-controls="events-custom-range"><CalendarOutlined aria-hidden /><span className="vehicle-trips__period-trigger-copy"><strong>{t("events.period")}</strong><span aria-hidden>·</span><span className="vehicle-trips__period-window">{t(`events.period.${filters.period ?? "7d"}` as `events.period.${AlertEventsPeriod}`)}</span></span><DownOutlined className="vehicle-trips__period-chevron" aria-hidden /></Button></PeriodPopover><Typography.Text type="secondary">{formatAlertTimestamp(filters.from ?? null, locale)} → {formatAlertTimestamp(filters.to ?? null, locale)} · Europe/Kyiv</Typography.Text></div>;
}
