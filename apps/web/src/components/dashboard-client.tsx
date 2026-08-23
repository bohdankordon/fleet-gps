"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardVehiclesResponse } from "@/lib/dashboard/dashboard-contract";
import { formatDistance, formatGeneratedAt, formatSpeed, formatTimestamp, freshnessLabel, qualityLabel, sourceLabel, statusLabel } from "@/lib/dashboard/dashboard-formatters";
import { dashboardHistoryPath, shouldUpdateDashboardHistory, type DashboardNavigationReason } from "@/lib/dashboard/dashboard-navigation";
import { parseDashboardQuery, serializeDashboardQuery, type DashboardActivity, type DashboardQuery, type DashboardStatus } from "@/lib/dashboard/dashboard-query";
import { SchedulerStatus } from "@/components/scheduler-status";
import { ClockIcon, FleetIcon, HelpIcon, HistoryIcon, NoPositionIcon, OfflineIcon, OnlineIcon, RouteIcon, WarningIcon } from "@/components/ui/icons";
import type { SchedulerStatusResponse } from "@/lib/scheduler/scheduler-contract";
import { Alert, Badge, Button, Card, Checkbox, EmptyState, FormField, Input, Label, LoadingStatus, NativeSelect, PageHeader } from "./ui";
import { useI18n } from "../i18n/client";

type Props = Readonly<{ initialData: DashboardVehiclesResponse; initialQuery: DashboardQuery; initialSchedulerStatus: SchedulerStatusResponse | null }>;
type BadgeVariant = "neutral" | "info" | "success" | "warning" | "danger";
type MetricTone = "primary" | "success" | "danger" | "info" | "warning" | "neutral";
function statusTone(status: string): BadgeVariant { return status === "online" ? "success" : status === "offline" ? "danger" : "neutral"; }
function freshnessTone(value: string): BadgeVariant { return value === "fresh" ? "success" : value === "missing" ? "neutral" : "warning"; }
function StatusIcon({ status }: Readonly<{ status: string }>) { const Icon = status === "online" ? OnlineIcon : status === "offline" ? OfflineIcon : HelpIcon; return <Icon className="status-icon" size={14} />; }
function FreshnessIcon({ value }: Readonly<{ value: string }>) { const Icon = value === "fresh" ? ClockIcon : value === "missing" ? NoPositionIcon : HistoryIcon; return <Icon className="status-icon" size={14} />; }

export function DashboardClient({ initialData, initialQuery, initialSchedulerStatus }: Props) {
  const { locale, t } = useI18n();
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
  return <div className="dashboard-page">
    <Header data={data} />
    <SchedulerStatus initialStatus={initialSchedulerStatus} timezone={data.timezone || "Europe/Kyiv"} />
    <section className="dashboard-filter-bar" aria-label={t("dashboard.filters.label")}>
      <FormField id="dashboard-search" label={t("dashboard.filters.search")}><Input type="search" value={query.search ?? ""} onChange={(event) => set("search", event.target.value || undefined)} placeholder={t("dashboard.filters.searchPlaceholder")} /></FormField>
      <FormField id="dashboard-status" label={t("dashboard.filters.status")}><NativeSelect value={query.status ?? ""} onChange={(event) => set("status", (event.target.value || undefined) as DashboardStatus | undefined)}><option value="">{t("common.all")}</option><option value="online">{t("dashboard.status.online")}</option><option value="offline">{t("dashboard.status.offline")}</option><option value="unknown">{t("dashboard.status.unknown")}</option></NativeSelect></FormField>
      <FormField id="dashboard-activity" label={t("dashboard.filters.activity")}><NativeSelect value={query.activity ?? ""} onChange={(event) => set("activity", (event.target.value || undefined) as DashboardActivity | undefined)}><option value="">{t("common.all")}</option><option value="below_threshold">{t("dashboard.activity.belowThreshold")}</option><option value="normal">{t("dashboard.activity.normalDistance")}</option><option value="no_data">{t("dashboard.activity.noData")}</option></NativeSelect></FormField>
      <Label className="dashboard-filter-checkbox"><Checkbox checked={query.includeDisabled !== false} onChange={(event) => set("includeDisabled", event.target.checked)} /> <span>{t("dashboard.filters.showDisabled")}</span></Label>
      <Button onClick={retry} loading={loading}>{loading ? t("common.refreshing") : t("common.refresh")}</Button>
    </section>
    {error && <Alert variant="danger" live="assertive" icon={<WarningIcon />} title={t("dashboard.loadError")} action={<Button variant="secondary" size="compact" onClick={retry}>{t("common.retry")}</Button>} />}
    {loading && <LoadingStatus title={t("dashboard.refreshingData")} className="dashboard-loading-status" />}
    <Summary data={data} />
    <section className="dashboard-data-surface" aria-busy={loading || undefined}>{data.vehicles.length === 0 ? <EmptyState title={t("dashboard.emptyTitle")}>{t("dashboard.emptyText")}</EmptyState> : <><div className="dashboard-table-container"><table><caption className="sr-only">{t("dashboard.table.label")}</caption><thead><tr><th scope="col">{t("dashboard.table.vehicle")}</th><th scope="col">{t("dashboard.table.status")}</th><th scope="col">{t("dashboard.table.gps")}</th><th scope="col" className="dashboard-cell--numeric">{t("dashboard.table.currentSpeed")}</th><th scope="col" className="dashboard-cell--numeric">{t("dashboard.table.dailyDistance")}</th><th scope="col">{t("dashboard.table.sourceQuality")}</th><th scope="col">{t("dashboard.table.activity")}</th></tr></thead><tbody>{data.vehicles.map((vehicle) => <tr key={vehicle.id}><td><strong><Link className="vehicle-detail-link" href={`/vehicles/${vehicle.id}`}>{vehicle.name}</Link></strong>{vehicle.disabled && <Badge variant="neutral">{t("dashboard.vehicle.disabled")}</Badge>}</td><td><Badge variant={statusTone(vehicle.status)}><StatusIcon status={vehicle.status} />{statusLabel(vehicle.status, locale)}</Badge></td><td><Badge variant={freshnessTone(vehicle.positionFreshness)}><FreshnessIcon value={vehicle.positionFreshness} />{freshnessLabel(vehicle.positionFreshness, locale)}</Badge><small>{formatTimestamp(vehicle.fixTime, data.timezone, locale)}</small></td><td className="dashboard-cell--numeric ui-tabular-nums">{formatSpeed(vehicle.speedKph, locale)}</td><td className="dashboard-cell--numeric ui-tabular-nums">{formatDistance(vehicle.dailyDistanceMeters, locale)}</td><td><span>{sourceLabel(vehicle.dailyDistanceSource, locale)}</span><small>{qualityLabel(vehicle.dailyDistanceQuality, locale)}</small></td><td>{vehicle.belowMinimumDistance ? <Badge variant="danger">{t("dashboard.activity.belowThreshold")}</Badge> : vehicle.dailyDistanceMeters === null ? t("common.noData") : t("dashboard.activity.normal")}</td></tr>)}</tbody></table></div><section className="dashboard-mobile-list" aria-label={t("dashboard.table.label")}>{data.vehicles.map((vehicle) => <Card as="article" className="dashboard-mobile-card" key={vehicle.id}><div className="dashboard-mobile-card__header"><strong><Link className="vehicle-detail-link" href={`/vehicles/${vehicle.id}`}>{vehicle.name}</Link></strong>{vehicle.disabled && <Badge variant="neutral">{t("dashboard.vehicle.disabled")}</Badge>}</div><div className="dashboard-mobile-card__badges"><Badge variant={statusTone(vehicle.status)}><StatusIcon status={vehicle.status} />{statusLabel(vehicle.status, locale)}</Badge><Badge variant={freshnessTone(vehicle.positionFreshness)}><FreshnessIcon value={vehicle.positionFreshness} />{freshnessLabel(vehicle.positionFreshness, locale)}</Badge></div><dl><div><dt>{t("dashboard.table.gps")}</dt><dd>{formatTimestamp(vehicle.fixTime, data.timezone, locale)}</dd></div><div><dt>{t("dashboard.mobile.speed")}</dt><dd className="ui-tabular-nums">{formatSpeed(vehicle.speedKph, locale)}</dd></div><div><dt>{t("dashboard.mobile.distance")}</dt><dd className="ui-tabular-nums">{formatDistance(vehicle.dailyDistanceMeters, locale)}</dd></div><div><dt>{t("dashboard.table.sourceQuality")}</dt><dd>{sourceLabel(vehicle.dailyDistanceSource, locale)}<small>{qualityLabel(vehicle.dailyDistanceQuality, locale)}</small></dd></div><div><dt>{t("dashboard.table.activity")}</dt><dd>{vehicle.belowMinimumDistance ? <Badge variant="danger">{t("dashboard.activity.belowThreshold")}</Badge> : vehicle.dailyDistanceMeters === null ? t("common.noData") : t("dashboard.activity.normal")}</dd></div></dl></Card>)}</section></>}</section>
  </div>;
}

function Summary({ data }: Readonly<{ data: DashboardVehiclesResponse }>) {
  const { t } = useI18n();
  const cards = [
    { label: t("dashboard.summary.total"), value: data.summary.total, tone: "primary" as MetricTone, Icon: FleetIcon },
    { label: t("dashboard.summary.online"), value: data.summary.online, tone: "success" as MetricTone, Icon: OnlineIcon },
    { label: t("dashboard.summary.offline"), value: data.summary.offline, tone: "danger" as MetricTone, Icon: OfflineIcon },
    { label: t("dashboard.summary.unknown"), value: data.summary.unknown, tone: "info" as MetricTone },
    { label: t("dashboard.summary.fresh"), value: data.summary.freshPositions, tone: "success" as MetricTone, Icon: ClockIcon },
    { label: t("dashboard.summary.stale"), value: data.summary.stalePositions, tone: "warning" as MetricTone, Icon: HistoryIcon },
    { label: t("dashboard.summary.missing"), value: data.summary.withoutPosition, tone: "neutral" as MetricTone },
    { label: t("dashboard.summary.belowMinimum"), value: data.summary.belowMinimumDistance, tone: "warning" as MetricTone, Icon: WarningIcon },
    { label: t("dashboard.summary.withoutDistance"), value: data.summary.withoutDailyStat, tone: "info" as MetricTone, Icon: RouteIcon },
  ];
  return <section className="dashboard-summary-grid" aria-label={t("dashboard.summary.label")}>{cards.map(({ label, value, tone, Icon }) => <Card as="article" className={`dashboard-stat-card dashboard-stat-card--${tone}`} key={label}><div><p>{label}</p><strong className="ui-tabular-nums">{value}</strong></div>{Icon ? <Icon className="dashboard-stat-card__icon" size={20} /> : null}</Card>)}</section>;
}
function Header({ data }: Readonly<{ data: DashboardVehiclesResponse }>) { const { locale, t } = useI18n(); return <PageHeader eyebrow={t("dashboard.eyebrow")} title={t("dashboard.title")} description={t("dashboard.description")} metadata={<><span>{t("dashboard.metadata.serviceDate")} <strong>{data.serviceDate}</strong></span><span>{t("dashboard.metadata.timezone")} <strong>{data.timezone}</strong></span><span>{t("dashboard.metadata.vehicles")} <strong>{data.summary.total}</strong></span><span>{t("dashboard.metadata.generated")} <time dateTime={data.generatedAt}>{formatGeneratedAt(data.generatedAt, data.timezone, locale)}</time></span></>} />; }
