"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUpDown, Ban, CalendarDays, CarFront, ChevronRight, Clock3, Gauge, Globe2, History, MapPinOff, RefreshCw, Search, TriangleAlert, type LucideIcon } from "lucide-react";
import type { DashboardVehiclesResponse } from "@/lib/dashboard/dashboard-contract";
import { dashboardTimezone, formatDistance, formatGeneratedAt, formatSpeed, formatTimestamp, freshnessLabel, qualityLabel, sourceLabel, statusLabel } from "@/lib/dashboard/dashboard-formatters";
import { dashboardHistoryPath, shouldUpdateDashboardHistory, type DashboardNavigationReason } from "@/lib/dashboard/dashboard-navigation";
import { parseDashboardQuery, serializeDashboardQuery, type DashboardActivity, type DashboardQuery, type DashboardStatus } from "@/lib/dashboard/dashboard-query";
import type { SchedulerStatusResponse } from "@/lib/scheduler/scheduler-contract";
import { SchedulerStatus } from "@/components/scheduler-status";
import { sortFleetVehicles, type FleetSort } from "@/components/fleet-overview-model";
import { useI18n } from "../i18n/client";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { PageHeader } from "./ui/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Skeleton } from "./ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type Props = Readonly<{ initialData: DashboardVehiclesResponse; initialQuery: DashboardQuery; initialSchedulerStatus: SchedulerStatusResponse | null }>;
type Vehicle = DashboardVehiclesResponse["vehicles"][number];
type Translator = ReturnType<typeof useI18n>["t"];
type SummaryMetric = Readonly<{ key: "total" | "online" | "offline" | "fresh" | "stale" | "missing" | "belowMinimum"; value: number; Icon: LucideIcon; tone: "brand" | "success" | "warning" | "neutral" | "danger" }>;

export function DashboardClient({ initialData, initialQuery, initialSchedulerStatus }: Props) {
  const { locale, t } = useI18n();
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState<DashboardQuery>(initialQuery);
  const [sort, setSort] = useState<FleetSort>("name");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const first = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const vehicles = useMemo(() => sortFleetVehicles(data.vehicles, sort, locale), [data.vehicles, locale, sort]);

  const request = useCallback(async (next: DashboardQuery, reason: DashboardNavigationReason) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setError(false);
    const encoded = serializeDashboardQuery(next);
    if (shouldUpdateDashboardHistory(reason)) window.history.pushState(null, "", dashboardHistoryPath(next));
    try {
      const response = await fetch(`/api/dashboard/vehicles${encoded ? `?${encoded}` : ""}`, { signal: abort.signal, cache: "no-store" });
      if (!response.ok) throw new Error();
      const body = await response.json() as DashboardVehiclesResponse;
      if (!abort.signal.aborted) setData(body);
    } catch {
      if (!abort.signal.aborted) setError(true);
    } finally {
      if (!abort.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const timer = window.setTimeout(() => { void request(query, "user"); }, 300);
    return () => window.clearTimeout(timer);
  }, [query, request]);

  useEffect(() => {
    const onPopState = () => {
      const restored = parseDashboardQuery(new URLSearchParams(window.location.search));
      first.current = true;
      setQuery(restored);
      void request(restored, "popstate");
    };
    window.addEventListener("popstate", onPopState);
    return () => { window.removeEventListener("popstate", onPopState); controller.current?.abort(); };
  }, [request]);

  const set = <K extends keyof DashboardQuery>(key: K, value: DashboardQuery[K]) => setQuery((current) => ({ ...current, [key]: value }));
  const retry = () => void request(query, error ? "retry" : "refresh");
  const hasFilters = Boolean(query.search || query.status || query.activity || query.includeDisabled === false);

  return <div className="dashboard-page fleet-overview">
    <FleetHeader data={data} schedulerStatus={initialSchedulerStatus} />
    <FleetToolbar query={query} sort={sort} hasFilters={hasFilters} refreshing={loading} onSet={set} onSort={setSort} onRefresh={retry} />
    {error ? <Alert variant="destructive" role="alert" className="fleet-error"><div><AlertTitle>{t("dashboard.loadError")}</AlertTitle><AlertDescription>{t("dashboard.initialErrorText")}</AlertDescription></div><Button variant="outline" size="sm" onClick={retry}>{t("common.retry")}</Button></Alert> : null}
    <FleetSummary data={data} />
    <section className="fleet-data-surface" aria-busy={loading || undefined}>
      {data.vehicles.length === 0 ? <EmptyFleetState filtered={hasFilters} /> : <>
        <div className="fleet-table-shell">
          <Table className="fleet-table"><colgroup><col className="fleet-col-vehicle" /><col className="fleet-col-status" /><col className="fleet-col-gps" /><col className="fleet-col-speed" /><col className="fleet-col-distance" /><col className="fleet-col-source" /><col className="fleet-col-position" /><col className="fleet-col-activity" /></colgroup><TableCaption className="sr-only">{t("dashboard.table.label")}</TableCaption><TableHeader><TableRow>
            <TableHead scope="col">{t("dashboard.table.vehicle")}</TableHead><TableHead scope="col">{t("dashboard.table.status")}</TableHead><TableHead scope="col">{t("dashboard.table.gps")}</TableHead><TableHead scope="col" className="fleet-number">{t("dashboard.table.currentSpeed")}</TableHead><TableHead scope="col" className="fleet-number">{t("dashboard.table.dailyDistance")}</TableHead><TableHead scope="col" className="fleet-optional-column">{t("dashboard.table.sourceQuality")}</TableHead><TableHead scope="col">{t("dashboard.metadata.generated")}</TableHead><TableHead scope="col" className="fleet-optional-column">{t("dashboard.table.activity")}</TableHead>
          </TableRow></TableHeader><TableBody>{vehicles.map((vehicle) => <FleetTableRow key={vehicle.id} vehicle={vehicle} data={data} />)}</TableBody></Table>
        </div>
        <section className="fleet-mobile-list" aria-label={t("dashboard.table.label")}>{vehicles.map((vehicle) => <FleetMobileRow key={vehicle.id} vehicle={vehicle} data={data} />)}</section>
      </>}
      {loading && data.vehicles.length === 0 ? <FleetSkeleton /> : null}
    </section>
  </div>;
}

function FleetHeader({ data, schedulerStatus }: Readonly<{ data: DashboardVehiclesResponse; schedulerStatus: SchedulerStatusResponse | null }>) {
  const { locale, t } = useI18n();
  return <PageHeader className="fleet-page-header" title={t("dashboard.title")} description={t("dashboard.description")} metadata={<>
    <MetadataItem Icon={CalendarDays} label={t("dashboard.metadata.serviceDate")} value={data.serviceDate} />
    <MetadataItem Icon={CarFront} label={t("dashboard.metadata.vehicles")} value={String(data.summary.total)} />
    <MetadataItem Icon={Globe2} label={t("dashboard.metadata.timezone")} value={dashboardTimezone(data)} />
    <MetadataItem Icon={Clock3} label={t("dashboard.metadata.generated")} value={<time dateTime={data.generatedAt}>{formatGeneratedAt(data.generatedAt, data.timezone, locale)}</time>} />
    <details className="fleet-service-status"><summary><ChevronRight aria-hidden="true" /><span>{t("dashboard.serviceStatus")}</span></summary><SchedulerStatus initialStatus={schedulerStatus} timezone={dashboardTimezone(data)} /></details>
  </>} />;
}

function MetadataItem({ Icon, label, value }: Readonly<{ Icon: LucideIcon; label: string; value: ReactNode }>) { return <span className="fleet-metadata-item"><Icon aria-hidden="true" /><span>{label}</span><strong>{value}</strong></span>; }

function FleetToolbar({ query, sort, hasFilters, refreshing, onSet, onSort, onRefresh }: Readonly<{ query: DashboardQuery; sort: FleetSort; hasFilters: boolean; refreshing: boolean; onSet: <K extends keyof DashboardQuery>(key: K, value: DashboardQuery[K]) => void; onSort: (value: FleetSort) => void; onRefresh: () => void }>) {
  const { t } = useI18n();
  const clear = () => { onSet("search", undefined); onSet("status", undefined); onSet("activity", undefined); onSet("includeDisabled", true); };
  return <section className="fleet-toolbar" aria-label={t("dashboard.filters.label")}>
    <div className="fleet-search"><label className="sr-only" htmlFor="fleet-search">{t("dashboard.filters.search")}</label><Search aria-hidden="true" /><Input id="fleet-search" type="search" value={query.search ?? ""} onChange={(event) => onSet("search", event.target.value || undefined)} placeholder={t("dashboard.filters.searchPlaceholder")} /></div>
    <label className="fleet-filter"><span className="sr-only">{t("dashboard.filters.status")}</span><Select value={query.status ?? "all"} onValueChange={(value) => onSet("status", value === "all" ? undefined : value as DashboardStatus)}><SelectTrigger className="fleet-filter__trigger" aria-label={t("dashboard.filters.status")}><span className="fleet-filter__label">{t("dashboard.filters.status")}:</span><SelectValue>{(value: string | null) => statusOptionLabel(value, t)}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">{t("common.all")}</SelectItem><SelectItem value="online">{t("dashboard.status.online")}</SelectItem><SelectItem value="offline">{t("dashboard.status.offline")}</SelectItem><SelectItem value="unknown">{t("dashboard.status.unknown")}</SelectItem></SelectContent></Select></label>
    <label className="fleet-filter fleet-filter--activity"><span className="sr-only">{t("dashboard.filters.activity")}</span><Select value={query.activity ?? "all"} onValueChange={(value) => onSet("activity", value === "all" ? undefined : value as DashboardActivity)}><SelectTrigger className="fleet-filter__trigger" aria-label={t("dashboard.filters.activity")}><span className="fleet-filter__label">{t("dashboard.filters.activity")}:</span><SelectValue>{(value: string | null) => activityOptionLabel(value, t)}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">{t("common.all")}</SelectItem><SelectItem value="below_threshold">{t("dashboard.activity.belowThreshold")}</SelectItem><SelectItem value="normal">{t("dashboard.activity.normalDistance")}</SelectItem><SelectItem value="no_data">{t("dashboard.activity.noData")}</SelectItem></SelectContent></Select></label>
    <label className="fleet-checkbox"><Checkbox checked={query.includeDisabled !== false} onCheckedChange={(checked) => onSet("includeDisabled", checked)} /><span>{t("dashboard.filters.showDisabled")}</span></label>
    <label className="fleet-filter fleet-sort"><span className="sr-only">{t("dashboard.sort.label")}</span><Select value={sort} onValueChange={(value) => onSort(value as FleetSort)}><SelectTrigger className="fleet-filter__trigger" aria-label={t("dashboard.sort.label")}><ArrowUpDown aria-hidden="true" /><span className="fleet-filter__label">{t("dashboard.sort.label")}:</span><SelectValue>{(value: string | null) => sortOptionLabel(value, t)}</SelectValue></SelectTrigger><SelectContent><SelectItem value="name">{t("dashboard.sort.name")}</SelectItem><SelectItem value="freshness">{t("dashboard.sort.freshness")}</SelectItem><SelectItem value="speed">{t("dashboard.sort.speed")}</SelectItem></SelectContent></Select></label>
    {hasFilters ? <Button variant="ghost" size="sm" className="fleet-clear" onClick={clear}>{t("dashboard.filters.clear")}</Button> : null}
    <Button size="sm" className="fleet-refresh" loading={refreshing} onClick={onRefresh} iconBefore={<RefreshCw />}>{refreshing ? t("common.refreshing") : t("common.refresh")}</Button>
  </section>;
}

function FleetSummary({ data }: Readonly<{ data: DashboardVehiclesResponse }>) {
  const { locale, t } = useI18n();
  const metrics: readonly SummaryMetric[] = [
    { key: "total", value: data.summary.total, Icon: CarFront, tone: "brand" },
    { key: "online", value: data.summary.online, Icon: CarFront, tone: "success" },
    { key: "offline", value: data.summary.offline, Icon: Clock3, tone: "danger" },
    { key: "fresh", value: data.summary.freshPositions, Icon: Gauge, tone: "brand" },
    { key: "stale", value: data.summary.stalePositions, Icon: History, tone: "warning" },
    { key: "missing", value: data.summary.withoutPosition, Icon: MapPinOff, tone: "neutral" },
    { key: "belowMinimum", value: data.summary.belowMinimumDistance, Icon: TriangleAlert, tone: "neutral" },
  ];
  return <section className="fleet-summary" aria-label={t("dashboard.summary.label")}>{metrics.map(({ key, value, Icon, tone }) => <article className={"fleet-summary-card fleet-summary-card--" + tone} key={key}>
    <span className="fleet-summary-card__icon"><Icon aria-hidden="true" /></span><div><p>{summaryMetricLabel(key, t)}</p><div><strong>{formatMetricCount(value, locale)}</strong>{data.summary.total > 0 && key !== "total" ? <small>{formatMetricPercent(value, data.summary.total, locale)}</small> : null}</div></div>
  </article>)}</section>;
}

function FleetTableRow({ vehicle, data }: Readonly<{ vehicle: Vehicle; data: DashboardVehiclesResponse }>) {
  const { locale } = useI18n();
  const distanceMissing = vehicle.dailyDistanceMeters === null;
  const sourceMissing = vehicle.dailyDistanceSource === null && vehicle.dailyDistanceQuality === null;
  return <TableRow>
    <TableCell className="fleet-identity"><div className="fleet-vehicle-identity"><CarFront aria-hidden="true" /><div><Link className="vehicle-detail-link" href={"/vehicles/" + vehicle.id}>{vehicle.name}</Link>{vehicle.disabled ? <ProviderDisabled /> : null}</div></div></TableCell>
    <TableCell><ConnectionStatus vehicle={vehicle} /></TableCell>
    <TableCell><FreshnessIndicator vehicle={vehicle} data={data} /></TableCell>
    <TableCell className="fleet-number"><MetricValue missing={vehicle.speedKph === null}>{formatSpeed(vehicle.speedKph, locale)}</MetricValue></TableCell>
    <TableCell className="fleet-number"><MetricValue missing={distanceMissing}>{formatDistance(vehicle.dailyDistanceMeters, locale)}</MetricValue></TableCell>
    <TableCell className="fleet-source-quality fleet-optional-column"><MetricValue missing={sourceMissing}><span>{sourceLabel(vehicle.dailyDistanceSource, locale)}</span>{vehicle.dailyDistanceQuality ? <small>{qualityLabel(vehicle.dailyDistanceQuality, locale)}</small> : null}</MetricValue></TableCell>
    <TableCell className="fleet-last-position"><MetricValue missing={vehicle.fixTime === null}>{vehicle.fixTime ? <time dateTime={vehicle.fixTime}>{formatTimestamp(vehicle.fixTime, data.timezone, locale)}</time> : null}</MetricValue></TableCell>
    <TableCell className="fleet-activity-cell fleet-optional-column"><FleetActivity vehicle={vehicle} /></TableCell>
  </TableRow>;
}

function FleetMobileRow({ vehicle, data }: Readonly<{ vehicle: Vehicle; data: DashboardVehiclesResponse }>) {
  const { locale, t } = useI18n();
  return <article className="fleet-mobile-row">
    <div className="fleet-mobile-row__head"><div className="fleet-mobile-row__identity"><CarFront aria-hidden="true" /><div><Link className="vehicle-detail-link" href={"/vehicles/" + vehicle.id}>{vehicle.name}</Link>{vehicle.disabled ? <ProviderDisabled /> : null}</div></div><Link className="fleet-open-link" href={"/vehicles/" + vehicle.id} aria-label={t("dashboard.openVehicle")}><ChevronRight aria-hidden="true" /></Link></div>
    <div className="fleet-mobile-row__health"><ConnectionStatus vehicle={vehicle} /><FreshnessIndicator vehicle={vehicle} data={data} compact /></div>
    <dl><div><dt>{t("dashboard.mobile.speed")}</dt><dd className="ui-tabular-nums">{formatSpeed(vehicle.speedKph, locale)}</dd></div><div><dt>{t("dashboard.mobile.distance")}</dt><dd className="ui-tabular-nums">{formatDistance(vehicle.dailyDistanceMeters, locale)}</dd></div><div><dt>{t("dashboard.table.activity")}</dt><dd><FleetActivity vehicle={vehicle} showNormal /></dd></div></dl>
    {vehicle.fixTime ? <time className="fleet-mobile-row__position" dateTime={vehicle.fixTime}>{formatTimestamp(vehicle.fixTime, data.timezone, locale)}</time> : null}
  </article>;
}

function ConnectionStatus({ vehicle }: Readonly<{ vehicle: Vehicle }>) { const { locale } = useI18n(); return <span className={"fleet-state-value fleet-state--" + vehicle.status}><span className="fleet-state-dot" aria-hidden="true" /><span>{statusLabel(vehicle.status, locale)}</span></span>; }
function FreshnessIndicator({ vehicle, data, compact = false }: Readonly<{ vehicle: Vehicle; data: DashboardVehiclesResponse; compact?: boolean }>) { const { locale } = useI18n(); const Icon = vehicle.positionFreshness === "missing" ? MapPinOff : vehicle.positionFreshness === "stale" || vehicle.positionFreshness === "future" ? History : null; return <span className={"fleet-position fleet-position--" + vehicle.positionFreshness}>{Icon ? <Icon aria-hidden="true" /> : <span className="fleet-position-dot" aria-hidden="true" />}<span>{freshnessLabel(vehicle.positionFreshness, locale)}</span>{!compact && vehicle.fixTime ? <time dateTime={vehicle.fixTime}>{formatTimestamp(vehicle.fixTime, data.timezone, locale)}</time> : null}</span>; }
function ProviderDisabled() { const { t } = useI18n(); return <span className="fleet-vehicle-disabled"><Ban aria-hidden="true" />{t("dashboard.vehicle.disabled")}</span>; }
function FleetActivity({ vehicle, showNormal = false }: Readonly<{ vehicle: Vehicle; showNormal?: boolean }>) { const { t } = useI18n(); if (vehicle.belowMinimumDistance) return <Badge variant="destructive" className="fleet-activity-badge"><Gauge aria-hidden="true" />{t("dashboard.activity.belowThreshold")}</Badge>; const label = vehicle.dailyDistanceMeters === null ? t("dashboard.activity.noData") : t("dashboard.activity.normal"); return <span className={showNormal ? "fleet-activity-muted" : "fleet-activity-muted fleet-activity-muted--desktop"}>{label}</span>; }
function MetricValue({ children, missing }: Readonly<{ children: ReactNode; missing: boolean }>) { const { t } = useI18n(); const label = missing ? t("common.noData") : undefined; return <span className={"fleet-metric " + (missing ? "fleet-metric--muted" : "")} aria-label={label} title={label}>{missing ? label : children}</span>; }
function formatMetricCount(value: number, locale: string) { return new Intl.NumberFormat(locale).format(value); }
function formatMetricPercent(value: number, total: number, locale: string) { return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(value / total); }
function summaryMetricLabel(key: SummaryMetric["key"], t: Translator) { switch (key) { case "total": return t("dashboard.summary.total"); case "online": return t("dashboard.summary.online"); case "offline": return t("dashboard.summary.offline"); case "fresh": return t("dashboard.summary.fresh"); case "stale": return t("dashboard.summary.stale"); case "missing": return t("dashboard.summary.missing"); case "belowMinimum": return t("dashboard.summary.belowMinimum"); } }
function statusOptionLabel(value: unknown, t: Translator): string { switch (value) { case "online": return t("dashboard.status.online"); case "offline": return t("dashboard.status.offline"); case "unknown": return t("dashboard.status.unknown"); default: return t("common.all"); } }
function activityOptionLabel(value: unknown, t: Translator): string { switch (value) { case "below_threshold": return t("dashboard.activity.belowThreshold"); case "normal": return t("dashboard.activity.normalDistance"); case "no_data": return t("dashboard.activity.noData"); default: return t("common.all"); } }
function sortOptionLabel(value: unknown, t: Translator): string { switch (value) { case "freshness": return t("dashboard.sort.freshness"); case "speed": return t("dashboard.sort.speed"); default: return t("dashboard.sort.name"); } }
function EmptyFleetState({ filtered }: Readonly<{ filtered: boolean }>) { const { t } = useI18n(); return <div className="fleet-empty"><MapPinOff aria-hidden="true" /><h2>{t(filtered ? "dashboard.emptyTitle" : "dashboard.noVehiclesTitle")}</h2><p>{t(filtered ? "dashboard.emptyText" : "dashboard.noVehiclesText")}</p></div>; }
function FleetSkeleton() { return <div className="fleet-skeleton" aria-label="Loading"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>; }
