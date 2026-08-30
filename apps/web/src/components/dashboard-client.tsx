"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, Ban, CheckCircle2, CircleHelp, Clock3, Gauge, History, MapPinOff, RefreshCw, Search, WifiOff } from "lucide-react";
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
    <FleetHeader data={data} refreshing={loading} onRefresh={retry} />
    <details className="fleet-service-status"><summary>{t("dashboard.serviceStatus")}</summary><SchedulerStatus initialStatus={initialSchedulerStatus} timezone={dashboardTimezone(data)} /></details>
    <FleetToolbar query={query} sort={sort} loading={loading} hasFilters={hasFilters} onSet={set} onSort={setSort} onRefresh={retry} />
    {error ? <Alert variant="destructive" role="alert" className="fleet-error"><WifiOff /><div><AlertTitle>{t("dashboard.loadError")}</AlertTitle><AlertDescription>{t("dashboard.initialErrorText")}</AlertDescription></div><Button variant="outline" size="sm" onClick={retry}>{t("common.retry")}</Button></Alert> : null}
    <FleetSummary data={data} />
    <section className="fleet-data-surface" aria-busy={loading || undefined}>
      {data.vehicles.length === 0 ? <EmptyFleetState filtered={hasFilters} /> : <>
        <div className="fleet-table-shell">
          <Table className="fleet-table"><TableCaption className="sr-only">{t("dashboard.table.label")}</TableCaption><TableHeader><TableRow>
            <TableHead scope="col">{t("dashboard.table.vehicle")}</TableHead><TableHead scope="col">{t("dashboard.table.status")}</TableHead><TableHead scope="col">{t("dashboard.table.gps")}</TableHead><TableHead scope="col" className="fleet-number">{t("dashboard.table.currentSpeed")}</TableHead><TableHead scope="col" className="fleet-distance">{t("dashboard.table.dailyDistance")}</TableHead><TableHead scope="col" className="fleet-activity">{t("dashboard.table.activity")}</TableHead>
          </TableRow></TableHeader><TableBody>{vehicles.map((vehicle) => <FleetTableRow key={vehicle.id} vehicle={vehicle} data={data} />)}</TableBody></Table>
        </div>
        <section className="fleet-mobile-list" aria-label={t("dashboard.table.label")}>{vehicles.map((vehicle) => <FleetMobileRow key={vehicle.id} vehicle={vehicle} data={data} />)}</section>
      </>}
      {loading && data.vehicles.length === 0 ? <FleetSkeleton /> : null}
    </section>
  </div>;
}

function FleetHeader({ data, refreshing, onRefresh }: Readonly<{ data: DashboardVehiclesResponse; refreshing: boolean; onRefresh: () => void }>) {
  const { locale, t } = useI18n();
  return <PageHeader className="fleet-page-header" eyebrow={t("dashboard.eyebrow")} title={t("dashboard.title")} description={t("dashboard.description")} metadata={<><span>{t("dashboard.metadata.vehicles")} <strong>{data.summary.total}</strong></span><span>{t("dashboard.metadata.serviceDate")} <strong>{data.serviceDate}</strong></span><span>{t("dashboard.metadata.generated")} <time dateTime={data.generatedAt}>{formatGeneratedAt(data.generatedAt, data.timezone, locale)}</time></span></>} actions={<Button variant="outline" size="sm" loading={refreshing} onClick={onRefresh} iconBefore={<RefreshCw />}>{refreshing ? t("common.refreshing") : t("common.refresh")}</Button>} />;
}

function FleetToolbar({ query, sort, loading, hasFilters, onSet, onSort, onRefresh }: Readonly<{ query: DashboardQuery; sort: FleetSort; loading: boolean; hasFilters: boolean; onSet: <K extends keyof DashboardQuery>(key: K, value: DashboardQuery[K]) => void; onSort: (value: FleetSort) => void; onRefresh: () => void }>) {
  const { t } = useI18n();
  const clear = () => { onSet("search", undefined); onSet("status", undefined); onSet("activity", undefined); onSet("includeDisabled", true); };
  return <section className="fleet-toolbar" aria-label={t("dashboard.filters.label")}>
    <div className="fleet-search"><label className="sr-only" htmlFor="fleet-search">{t("dashboard.filters.search")}</label><Search aria-hidden="true" /><Input id="fleet-search" type="search" value={query.search ?? ""} onChange={(event) => onSet("search", event.target.value || undefined)} placeholder={t("dashboard.filters.searchPlaceholder")} /></div>
    <label className="fleet-select"><span>{t("dashboard.filters.status")}</span><Select value={query.status ?? "all"} onValueChange={(value) => onSet("status", value === "all" ? undefined : value as DashboardStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("common.all")}</SelectItem><SelectItem value="online">{t("dashboard.status.online")}</SelectItem><SelectItem value="offline">{t("dashboard.status.offline")}</SelectItem><SelectItem value="unknown">{t("dashboard.status.unknown")}</SelectItem></SelectContent></Select></label>
    <label className="fleet-select fleet-select--activity"><span>{t("dashboard.filters.activity")}</span><Select value={query.activity ?? "all"} onValueChange={(value) => onSet("activity", value === "all" ? undefined : value as DashboardActivity)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("common.all")}</SelectItem><SelectItem value="below_threshold">{t("dashboard.activity.belowThreshold")}</SelectItem><SelectItem value="normal">{t("dashboard.activity.normalDistance")}</SelectItem><SelectItem value="no_data">{t("dashboard.activity.noData")}</SelectItem></SelectContent></Select></label>
    <label className="fleet-checkbox"><Checkbox checked={query.includeDisabled !== false} onCheckedChange={(checked) => onSet("includeDisabled", checked)} /><span>{t("dashboard.filters.showDisabled")}</span></label>
    <label className="fleet-select fleet-sort"><span><ArrowUpDown aria-hidden="true" />{t("dashboard.sort.label")}</span><Select value={sort} onValueChange={(value) => onSort(value as FleetSort)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="name">{t("dashboard.sort.name")}</SelectItem><SelectItem value="freshness">{t("dashboard.sort.freshness")}</SelectItem><SelectItem value="speed">{t("dashboard.sort.speed")}</SelectItem></SelectContent></Select></label>
    {hasFilters ? <Button variant="ghost" size="sm" onClick={clear}>{t("dashboard.filters.clear")}</Button> : null}
    <Button className="fleet-toolbar-refresh" variant="outline" size="sm" loading={loading} onClick={onRefresh} iconBefore={<RefreshCw />} aria-label={t("common.refresh")} />
  </section>;
}

function FleetTableRow({ vehicle, data }: Readonly<{ vehicle: Vehicle; data: DashboardVehiclesResponse }>) {
  const { locale, t } = useI18n();
  return <TableRow><TableCell className="fleet-identity"><Link className="vehicle-detail-link" href={`/vehicles/${vehicle.id}`}>{vehicle.name}</Link>{vehicle.disabled ? <ProviderDisabled /> : null}</TableCell><TableCell><ConnectionStatus vehicle={vehicle} /></TableCell><TableCell><FreshnessIndicator vehicle={vehicle} data={data} /></TableCell><TableCell className="fleet-number ui-tabular-nums">{formatSpeed(vehicle.speedKph, locale)}</TableCell><TableCell className="fleet-distance ui-tabular-nums"><span>{formatDistance(vehicle.dailyDistanceMeters, locale)}</span><small>{sourceLabel(vehicle.dailyDistanceSource, locale)} · {qualityLabel(vehicle.dailyDistanceQuality, locale)}</small></TableCell><TableCell className="fleet-activity">{vehicle.belowMinimumDistance ? <Badge variant="destructive" className="fleet-badge"><Gauge />{t("dashboard.activity.belowThreshold")}</Badge> : vehicle.dailyDistanceMeters === null ? t("common.noData") : t("dashboard.activity.normal")}</TableCell></TableRow>;
}

function FleetMobileRow({ vehicle, data }: Readonly<{ vehicle: Vehicle; data: DashboardVehiclesResponse }>) {
  const { locale, t } = useI18n();
  return <article className="fleet-mobile-row"><div className="fleet-mobile-row__top"><div><Link className="vehicle-detail-link" href={`/vehicles/${vehicle.id}`}>{vehicle.name}</Link>{vehicle.disabled ? <ProviderDisabled /> : null}</div><Link className="fleet-open-link" href={`/vehicles/${vehicle.id}`}>{t("dashboard.openVehicle")}</Link></div><div className="fleet-mobile-row__statuses"><ConnectionStatus vehicle={vehicle} /><FreshnessIndicator vehicle={vehicle} data={data} compact /></div><dl><div><dt>{t("dashboard.mobile.speed")}</dt><dd className="ui-tabular-nums">{formatSpeed(vehicle.speedKph, locale)}</dd></div><div><dt>{t("dashboard.table.gps")}</dt><dd>{formatTimestamp(vehicle.fixTime, data.timezone, locale)}</dd></div><div><dt>{t("dashboard.mobile.distance")}</dt><dd className="ui-tabular-nums">{formatDistance(vehicle.dailyDistanceMeters, locale)}</dd></div><div><dt>{t("dashboard.table.activity")}</dt><dd>{vehicle.belowMinimumDistance ? t("dashboard.activity.belowThreshold") : vehicle.dailyDistanceMeters === null ? t("common.noData") : t("dashboard.activity.normal")}</dd></div></dl></article>;
}

function ConnectionStatus({ vehicle }: Readonly<{ vehicle: Vehicle }>) { const { locale } = useI18n(); const config = vehicle.status === "online" ? { Icon: CheckCircle2, variant: "default" as const } : vehicle.status === "offline" ? { Icon: WifiOff, variant: "destructive" as const } : { Icon: CircleHelp, variant: "outline" as const }; return <Badge variant={config.variant} className="fleet-badge"><config.Icon />{statusLabel(vehicle.status, locale)}</Badge>; }
function FreshnessIndicator({ vehicle, data, compact = false }: Readonly<{ vehicle: Vehicle; data: DashboardVehiclesResponse; compact?: boolean }>) { const { locale } = useI18n(); const config = vehicle.positionFreshness === "fresh" ? { Icon: Clock3, className: "fleet-badge--fresh" } : vehicle.positionFreshness === "missing" ? { Icon: MapPinOff, className: "fleet-badge--missing" } : { Icon: History, className: "fleet-badge--stale" }; return <div className="fleet-freshness"><Badge variant="outline" className={`fleet-badge ${config.className}`}><config.Icon />{freshnessLabel(vehicle.positionFreshness, locale)}</Badge>{compact ? null : <small>{formatTimestamp(vehicle.fixTime, data.timezone, locale)}</small>}</div>; }
function ProviderDisabled() { const { t } = useI18n(); return <Badge variant="outline" className="fleet-badge fleet-badge--disabled"><Ban />{t("dashboard.vehicle.disabled")}</Badge>; }

function FleetSummary({ data }: Readonly<{ data: DashboardVehiclesResponse }>) { const { t } = useI18n(); const metrics = [["total", data.summary.total], ["online", data.summary.online], ["fresh", data.summary.freshPositions], ["stale", data.summary.stalePositions], ["missing", data.summary.withoutPosition]] as const; return <section className="fleet-summary" aria-label={t("dashboard.summary.label")}>{metrics.map(([key, value]) => <div key={key}><span>{t(`dashboard.summary.${key}`)}</span><strong className="ui-tabular-nums">{value}</strong></div>)}</section>; }
function EmptyFleetState({ filtered }: Readonly<{ filtered: boolean }>) { const { t } = useI18n(); return <div className="fleet-empty"><MapPinOff aria-hidden="true" /><h2>{t(filtered ? "dashboard.emptyTitle" : "dashboard.noVehiclesTitle")}</h2><p>{t(filtered ? "dashboard.emptyText" : "dashboard.noVehiclesText")}</p></div>; }
function FleetSkeleton() { return <div className="fleet-skeleton" aria-label="Loading"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>; }
