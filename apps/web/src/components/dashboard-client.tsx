"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Alert, Badge, Button, Card, Checkbox, Col, Collapse, Empty, Flex, Grid, Input, Listy, Row, Select, Space, Spin, Statistic, Table, Tag, theme } from "antd";
import type { TableColumnsType } from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import Text from "antd/es/typography/Text";
import Title from "antd/es/typography/Title";
import type { DashboardVehiclesResponse } from "@/lib/dashboard/dashboard-contract";
import { dashboardTimezone, formatDistance, formatFleetMetadataTimestamp, formatFleetServiceDate, formatSpeed, formatTimestamp, freshnessLabel, qualityLabel, sourceLabel, statusLabel } from "@/lib/dashboard/dashboard-formatters";
import { dashboardHistoryPath, shouldUpdateDashboardHistory, type DashboardNavigationReason } from "@/lib/dashboard/dashboard-navigation";
import { parseDashboardQuery, serializeDashboardQuery, type DashboardActivity, type DashboardQuery, type DashboardStatus } from "@/lib/dashboard/dashboard-query";
import type { SchedulerStatusResponse } from "@/lib/scheduler/scheduler-contract";
import { SchedulerStatus } from "./scheduler-status";
import { sortFleetVehicles, type FleetSort } from "./fleet-overview-model";
import { StableLoadingButton } from "./stable-loading-button";
import { useI18n } from "../i18n/client";

type Props = Readonly<{ initialData: DashboardVehiclesResponse; initialQuery: DashboardQuery; initialSchedulerStatus: SchedulerStatusResponse | null }>;
type Vehicle = DashboardVehiclesResponse["vehicles"][number];
type SelectOption = Readonly<{ value: string; label: string }>;

export function DashboardClient({ initialData, initialQuery, initialSchedulerStatus }: Props) {
  const { locale, t } = useI18n(); const screens = Grid.useBreakpoint();
  const [data, setData] = useState(initialData); const [query, setQuery] = useState<DashboardQuery>(initialQuery); const [sort, setSort] = useState<FleetSort>("name"); const [loading, setLoading] = useState(false); const [error, setError] = useState(false); const first = useRef(true); const controller = useRef<AbortController | null>(null);
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
  const resetFilters = () => setQuery((current) => ({ ...current, status: undefined, activity: undefined, includeDisabled: true }));
  const retry = () => void request(query, error ? "retry" : "refresh");
  const hasActiveFilters = Boolean(query.search || query.status || query.activity || query.includeDisabled === false);
  const columns = fleetColumns(data, locale, t);
  const vehicles = useMemo(() => sortFleetVehicles(data.vehicles, sort, locale), [data.vehicles, locale, sort]);

  return <div className="fleet-page">
    <FleetHeader data={data} />
    <SchedulerStatus initialStatus={initialSchedulerStatus} timezone={dashboardTimezone(data)} />
    <Summary data={data} />
    {error ? <Alert type="error" showIcon message={t("dashboard.loadError")} action={<Button onClick={retry}>{t("common.retry")}</Button>} /> : null}
    <FleetToolbar query={query} sort={sort} loading={loading} onSet={set} onResetFilters={resetFilters} onSort={setSort} onRefresh={retry} />
    {screens.md ? <Table<Vehicle> aria-label={t("dashboard.table.label")} size="middle" rowKey="id" columns={columns} dataSource={vehicles} loading={loading} pagination={false} scroll={{ x: 960 }} locale={{ emptyText: <Empty description={hasActiveFilters ? t("dashboard.emptyTitle") : t("dashboard.emptyFleetTitle")}><Text type="secondary">{hasActiveFilters ? t("dashboard.emptyText") : t("dashboard.emptyFleetText")}</Text></Empty> }} /> : <FleetMobileList data={{ ...data, vehicles }} loading={loading} emptyDescription={hasActiveFilters ? t("dashboard.emptyTitle") : t("dashboard.emptyFleetTitle")} emptyText={hasActiveFilters ? t("dashboard.emptyText") : t("dashboard.emptyFleetText")} />}
  </div>;
}

function FleetHeader({ data }: Readonly<{ data: DashboardVehiclesResponse }>) { const { locale, t } = useI18n(); return <Flex vertical gap={4}><Title level={1} style={{ margin: 0 }}>{t("dashboard.title")}</Title><Text type="secondary">{t("dashboard.description")}</Text><Flex wrap="wrap" gap="middle"><MetadataItem label={t("dashboard.metadata.serviceDate")}><time dateTime={data.serviceDate}>{formatFleetServiceDate(data.serviceDate, locale)}</time></MetadataItem><MetadataItem label={t("dashboard.metadata.timezone")}>{data.timezone}</MetadataItem><MetadataItem label={t("dashboard.metadata.vehicles")}>{data.summary.total}</MetadataItem><MetadataItem label={t("dashboard.metadata.generated")}><time dateTime={data.generatedAt}>{formatFleetMetadataTimestamp(data.generatedAt, data.timezone, locale)}</time></MetadataItem></Flex></Flex>; }

function MetadataItem({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) { return <Text type="secondary">{label}: <Text strong>{children}</Text></Text>; }

function FleetToolbar({ query, sort, loading, onSet, onResetFilters, onSort, onRefresh }: Readonly<{ query: DashboardQuery; sort: FleetSort; loading: boolean; onSet: <K extends keyof DashboardQuery>(key: K, value: DashboardQuery[K]) => void; onResetFilters: () => void; onSort: (value: FleetSort) => void; onRefresh: () => void }>) {
  const { t } = useI18n();
  const { token } = theme.useToken();
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const statusOptions: readonly SelectOption[] = [{ value: "", label: t("dashboard.toolbar.statusAll") }, { value: "online", label: t("dashboard.status.online") }, { value: "offline", label: t("dashboard.status.offline") }, { value: "unknown", label: t("dashboard.status.unknown") }];
  const activityOptions: readonly SelectOption[] = [{ value: "", label: t("dashboard.toolbar.activityAll") }, { value: "below_threshold", label: t("dashboard.toolbar.activityBelowMinimum") }, { value: "normal", label: t("dashboard.toolbar.activityMeetsMinimum") }, { value: "no_data", label: t("dashboard.toolbar.activityNoData") }];
  const sortOptions: readonly SelectOption[] = [{ value: "name", label: t("dashboard.sort.name") }, { value: "freshness", label: t("dashboard.sort.freshness") }, { value: "speed", label: t("dashboard.sort.speed") }];
  const selectSizingStyle = { "--fleet-toolbar-select-font-size": `${token.fontSizeLG}px`, "--fleet-toolbar-select-padding-start": `${token.controlPaddingHorizontal}px`, "--fleet-toolbar-select-padding-end": `${token.controlPaddingHorizontal + token.fontSize + token.paddingXS}px` } as CSSProperties;
  const activeFilterCount = Number(Boolean(query.status)) + Number(Boolean(query.activity)) + Number(query.includeDisabled === false);
  const filterHeader = <Space size="small"><Text strong>{t("dashboard.toolbar.filters")}</Text>{activeFilterCount > 0 ? <Text type="secondary">· {t(activeFilterCount === 1 ? "dashboard.toolbar.activeFiltersOne" : "dashboard.toolbar.activeFiltersMany", { count: activeFilterCount })}</Text> : null}</Space>;
  const reset = <Button size="small" styles={{ root: { minHeight: 0 } }} disabled={activeFilterCount === 0} onClick={(event) => { event.stopPropagation(); onResetFilters(); }}>{t("dashboard.toolbar.resetFilters")}</Button>;
  const filters = <div className="fleet-toolbar__filter-controls">
    <LabeledSelect fieldLabel={t("dashboard.filters.status")} ariaLabel={t("dashboard.filters.status")} value={query.status ?? ""} options={statusOptions} sizingStyle={selectSizingStyle} onChange={(value) => onSet("status", (value || undefined) as DashboardStatus | undefined)} />
    <LabeledSelect fieldLabel={t("dashboard.filters.activity")} ariaLabel={t("dashboard.filters.activity")} value={query.activity ?? ""} options={activityOptions} sizingStyle={selectSizingStyle} onChange={(value) => onSet("activity", (value || undefined) as DashboardActivity | undefined)} />
    <Checkbox aria-label={t("dashboard.filters.showDisabledAria")} styles={{ root: { gap: 0, fontWeight: 400 }, icon: { overflow: "clip" } }} checked={query.includeDisabled !== false} onChange={(event) => onSet("includeDisabled", event.target.checked)}>{t("dashboard.filters.showDisabled")}</Checkbox>
  </div>;
  return <section className="fleet-toolbar" aria-label={t("dashboard.filters.label")} style={{ borderColor: token.colorBorderSecondary, borderRadius: token.borderRadiusLG, background: token.colorBgContainer, padding: token.paddingSM }}>
    <div className="fleet-toolbar__list-controls">
      <Input className="fleet-toolbar__search" size="large" styles={{ root: { height: token.controlHeightLG }, input: { minHeight: 0 } }} aria-label={t("dashboard.filters.search")} allowClear prefix={<SearchOutlined />} value={query.search ?? ""} onChange={(event) => onSet("search", event.target.value || undefined)} placeholder={t("dashboard.filters.searchPlaceholder")} />
      <LabeledSelect fieldLabel={t("dashboard.sort.label")} ariaLabel={t("dashboard.sort.label")} value={sort} options={sortOptions} sizingStyle={selectSizingStyle} onChange={(value) => onSort(value as FleetSort)} />
      <StableLoadingButton idleLabel={t("common.refresh")} loadingLabel={t("common.refreshing")} loading={loading} icon={<ReloadOutlined />} onClick={onRefresh} size="large" type="primary" />
    </div>
    <div className="fleet-toolbar__filters" style={{ borderTopColor: token.colorBorderSecondary }}>
      <Collapse ghost size="small" activeKey={activeKeys} onChange={(keys) => setActiveKeys(Array.isArray(keys) ? keys.map(String) : [String(keys)])} styles={{ header: { paddingInline: 0 }, body: { padding: `${token.paddingXS}px 0 0` } }} items={[{ key: "filters", label: filterHeader, extra: reset, children: filters }]} />
    </div>
  </section>;
}

function LabeledSelect({ fieldLabel, ariaLabel, value, options, sizingStyle, onChange }: Readonly<{ fieldLabel: string; ariaLabel: string; value: string; options: readonly SelectOption[]; sizingStyle: CSSProperties; onChange: (value: string) => void }>) {
  return <span className="fleet-toolbar__labeled-select" style={sizingStyle}>
    <span className="fleet-toolbar__select-sizer" aria-hidden="true">{options.map((option) => <span key={option.value}>{fieldLabel}: {option.label}</span>)}</span>
    <Select className="fleet-toolbar__select-control" size="large" aria-label={ariaLabel} popupMatchSelectWidth labelRender={({ label }) => <>{fieldLabel}: {label}</>} styles={{ input: { minHeight: 0, outline: "none", boxShadow: "none", transition: "none" } }} value={value} onChange={onChange} options={[...options]} />
  </span>;
}

function Summary({ data }: Readonly<{ data: DashboardVehiclesResponse }>) { const { t } = useI18n(); return <section aria-label={t("dashboard.summary.label")}><Row gutter={[16, 16]}><Col xs={24} sm={12} xl={6}><Card className="fleet-summary-card" size="small" title={t("dashboard.summary.total")} styles={{ body: { display: "flex", alignItems: "center" } }}><Statistic value={data.summary.total} /></Card></Col><SummaryCard title={t("dashboard.summary.connection")} metrics={[{ label: t("dashboard.summary.online"), value: data.summary.online, status: "success" }, { label: t("dashboard.summary.offline"), value: data.summary.offline, status: "error" }, { label: t("dashboard.summary.unknown"), value: data.summary.unknown, status: "default" }]} /><SummaryCard title={t("dashboard.summary.gps")} metrics={[{ label: t("dashboard.summary.fresh"), value: data.summary.freshPositions, status: "success" }, { label: t("dashboard.summary.stale"), value: data.summary.stalePositions, status: "warning" }, { label: t("dashboard.summary.missing"), value: data.summary.withoutPosition, status: "default" }]} /><SummaryCard title={t("dashboard.summary.distance")} metrics={[{ label: t("dashboard.summary.belowMinimum"), value: data.summary.belowMinimumDistance, status: "warning" }, { label: t("dashboard.summary.withoutDistance"), value: data.summary.withoutDailyStat, status: "default" }]} /></Row></section>; }

function SummaryCard({ title, metrics }: Readonly<{ title: string; metrics: readonly { label: string; value: number; status: "success" | "error" | "warning" | "default" }[] }>) { return <Col xs={24} sm={12} xl={6}><Card className="fleet-summary-card" size="small" title={title}><Flex vertical gap="small">{metrics.map((metric) => <Flex key={metric.label} justify="space-between" align="center" gap="small"><Space size="small"><Badge status={metric.status} /><Text type="secondary">{metric.label}:</Text></Space><Text strong>{metric.value}</Text></Flex>)}</Flex></Card></Col>; }

function fleetColumns(data: DashboardVehiclesResponse, locale: ReturnType<typeof useI18n>["locale"], t: ReturnType<typeof useI18n>["t"]): TableColumnsType<Vehicle> { return [
  { title: t("dashboard.table.vehicle"), key: "vehicle", render: (_, vehicle) => <Space orientation="vertical" size={0}><Link href={`/vehicles/${vehicle.id}`}>{vehicle.name}</Link>{vehicle.disabled ? <Tag>{t("dashboard.vehicle.disabled")}</Tag> : null}</Space> },
  { title: t("dashboard.table.status"), dataIndex: "status", key: "status", responsive: ["sm"], render: (status: Vehicle["status"]) => <Badge status={status === "online" ? "success" : status === "offline" ? "error" : "default"} text={statusLabel(status, locale)} /> },
  { title: t("dashboard.table.gps"), key: "gps", render: (_, vehicle) => <Space orientation="vertical" size={0}><Tag color={vehicle.positionFreshness === "fresh" ? "green" : vehicle.positionFreshness === "stale" ? "orange" : undefined}>{freshnessLabel(vehicle.positionFreshness, locale)}</Tag><Text type="secondary">{formatTimestamp(vehicle.fixTime, data.timezone, locale)}</Text></Space> },
  { title: t("dashboard.table.currentSpeed"), dataIndex: "speedKph", key: "speed", align: "right", responsive: ["md"], render: (value: Vehicle["speedKph"]) => formatSpeed(value, locale) },
  { title: t("dashboard.table.dailyDistance"), dataIndex: "dailyDistanceMeters", key: "distance", align: "right", responsive: ["md"], render: (value: Vehicle["dailyDistanceMeters"]) => formatDistance(value, locale) },
  { title: t("dashboard.table.sourceQuality"), key: "sourceQuality", responsive: ["lg"], render: (_, vehicle) => <SourceQuality vehicle={vehicle} locale={locale} t={t} /> },
  { title: t("dashboard.table.activity"), key: "activity", responsive: ["lg"], render: (_, vehicle) => vehicle.belowMinimumDistance ? <Tag color="error">{t("dashboard.activity.belowThreshold")}</Tag> : vehicle.dailyDistanceMeters === null ? t("common.noData") : t("dashboard.activity.normal") },
]; }

function SourceQuality({ vehicle, locale, t }: Readonly<{ vehicle: Vehicle; locale: ReturnType<typeof useI18n>["locale"]; t: ReturnType<typeof useI18n>["t"] }>) { if (vehicle.dailyDistanceSource === null && vehicle.dailyDistanceQuality === null) return <Text type="secondary">{t("common.noData")}</Text>; return <Space orientation="vertical" size={0}><Text>{sourceLabel(vehicle.dailyDistanceSource, locale)}</Text><Text type="secondary">{qualityLabel(vehicle.dailyDistanceQuality, locale)}</Text></Space>; }

function sourceQualityText(vehicle: Vehicle, locale: ReturnType<typeof useI18n>["locale"], t: ReturnType<typeof useI18n>["t"]): string { return vehicle.dailyDistanceSource === null && vehicle.dailyDistanceQuality === null ? t("common.noData") : `${sourceLabel(vehicle.dailyDistanceSource, locale)} / ${qualityLabel(vehicle.dailyDistanceQuality, locale)}`; }

function FleetMobileList({ data, loading, emptyDescription, emptyText }: Readonly<{ data: DashboardVehiclesResponse; loading: boolean; emptyDescription: string; emptyText: string }>) { const { locale, t } = useI18n(); if (data.vehicles.length === 0) return <Empty description={emptyDescription}><Text type="secondary">{emptyText}</Text></Empty>; return <Spin spinning={loading}><Listy<Vehicle> items={data.vehicles} rowKey="id" itemRender={(vehicle) => <Flex vertical gap="small"><Flex justify="space-between" gap="small"><Link href={`/vehicles/${vehicle.id}`}>{vehicle.name}</Link>{vehicle.disabled ? <Tag>{t("dashboard.vehicle.disabled")}</Tag> : null}</Flex><Space wrap><Badge status={vehicle.status === "online" ? "success" : vehicle.status === "offline" ? "error" : "default"} text={statusLabel(vehicle.status, locale)} /><Tag color={vehicle.positionFreshness === "fresh" ? "green" : vehicle.positionFreshness === "stale" ? "orange" : undefined}>{freshnessLabel(vehicle.positionFreshness, locale)}</Tag></Space><Flex wrap="wrap" gap="middle"><Text type="secondary">{t("dashboard.table.gps")}: {formatTimestamp(vehicle.fixTime, data.timezone, locale)}</Text><Text type="secondary">{t("dashboard.mobile.speed")}: {formatSpeed(vehicle.speedKph, locale)}</Text><Text type="secondary">{t("dashboard.mobile.distance")}: {formatDistance(vehicle.dailyDistanceMeters, locale)}</Text><Text type="secondary">{t("dashboard.table.sourceQuality")}: {sourceQualityText(vehicle, locale, t)}</Text></Flex></Flex>} /></Spin>; }
