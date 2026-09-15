"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Alert, Badge, Button, Card, Checkbox, Col, Collapse, ConfigProvider, Empty, Flex, Grid, Listy, Row, Space, Spin, Statistic, Table, Tag, theme } from "antd";
import type { TableColumnsType } from "antd";
import { AimOutlined, ApiFilled, BarChartOutlined, CarFilled, CarOutlined, FilterFilled, ReloadOutlined } from "@ant-design/icons";
import Paragraph from "antd/es/typography/Paragraph";
import Text from "antd/es/typography/Text";
import { CompactPageHeading } from "./compact-page-heading";
import type { DashboardVehiclesResponse } from "@/lib/dashboard/dashboard-contract";
import { dashboardTimezone, formatDistance, formatFleetGpsTimestamp, formatFleetMetadataTimestamp, formatFleetServiceDate, formatSpeed, formatTimestamp, freshnessLabel, qualityLabel, sourceLabel, statusLabel } from "@/lib/dashboard/dashboard-formatters";
import { dashboardHistoryPath, shouldUpdateDashboardHistory, type DashboardNavigationReason } from "@/lib/dashboard/dashboard-navigation";
import { parseDashboardQuery, serializeDashboardQuery, type DashboardActivity, type DashboardQuery, type DashboardStatus } from "@/lib/dashboard/dashboard-query";
import type { SchedulerStatusResponse } from "@/lib/scheduler/scheduler-contract";
import { SchedulerStatus } from "./scheduler-status";
import { FleetSearchInput, FLEET_SEARCH_DEBOUNCE_MS } from "./fleet-search-input";
import { sortFleetVehicles, type FleetSort } from "./fleet-overview-model";
import { StableLoadingButton } from "./stable-loading-button";
import { LabeledFilterSelect } from "./labeled-filter-select";
import { VehicleGroupTag } from "./vehicle-detail-shell";
import { useI18n } from "../i18n/client";

type Props = Readonly<{ initialData: DashboardVehiclesResponse; initialQuery: DashboardQuery; initialSchedulerStatus: SchedulerStatusResponse | null }>;
type Vehicle = DashboardVehiclesResponse["vehicles"][number];
type SelectOption = Readonly<{ value: string; label: string }>;

export function DashboardClient({ initialData, initialQuery, initialSchedulerStatus }: Props) {
  const { locale, t } = useI18n(); const screens = Grid.useBreakpoint();
  const [data, setData] = useState(initialData); const [query, setQuery] = useState<DashboardQuery>(initialQuery); const [sort, setSort] = useState<FleetSort>("name"); const [loading, setLoading] = useState(false); const [error, setError] = useState(false); const controller = useRef<AbortController | null>(null); const pendingRequest = useRef<number | null>(null); const queryRef = useRef(initialQuery);
  const request = useCallback(async (next: DashboardQuery, reason: DashboardNavigationReason) => {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort; setLoading(true); setError(false);
    const encoded = serializeDashboardQuery(next); if (shouldUpdateDashboardHistory(reason)) window.history.pushState(null, "", dashboardHistoryPath(next));
    try { const response = await fetch(`/api/dashboard/vehicles${encoded ? `?${encoded}` : ""}`, { signal: abort.signal, cache: "no-store" }); if (!response.ok) throw new Error(); const body = await response.json() as DashboardVehiclesResponse; if (!abort.signal.aborted) setData(body); }
    catch { if (!abort.signal.aborted) setError(true); }
    finally { if (!abort.signal.aborted) setLoading(false); }
  }, []);
  const commitQuery = useCallback((next: DashboardQuery, delay: number) => {
    queryRef.current = next; setQuery(next);
    if (pendingRequest.current !== null) window.clearTimeout(pendingRequest.current);
    if (delay === 0) { pendingRequest.current = null; void request(next, "user"); return; }
    pendingRequest.current = window.setTimeout(() => { pendingRequest.current = null; void request(next, "user"); }, delay);
  }, [request]);
  useEffect(() => { const onPopState = () => { const restored = parseDashboardQuery(new URLSearchParams(window.location.search)); if (pendingRequest.current !== null) window.clearTimeout(pendingRequest.current); queryRef.current = restored; setQuery(restored); void request(restored, "popstate"); }; window.addEventListener("popstate", onPopState); return () => { window.removeEventListener("popstate", onPopState); if (pendingRequest.current !== null) window.clearTimeout(pendingRequest.current); controller.current?.abort(); }; }, [request]);
  const set = <K extends keyof DashboardQuery>(key: K, value: DashboardQuery[K]) => commitQuery({ ...queryRef.current, [key]: value }, FLEET_SEARCH_DEBOUNCE_MS);
  const commitSearch = useCallback((search: string | undefined) => commitQuery({ ...queryRef.current, search }, 0), [commitQuery]);
  const resetFilters = () => commitQuery({ ...queryRef.current, status: undefined, activity: undefined, includeDisabled: true, group: undefined }, FLEET_SEARCH_DEBOUNCE_MS);
  const retry = () => void request(queryRef.current, error ? "retry" : "refresh");
  const hasActiveFilters = Boolean(query.search || query.status || query.activity || query.includeDisabled === false || query.group);
  const columns = fleetColumns(data, locale, t);
  const vehicles = useMemo(() => sortFleetVehicles(data.vehicles, sort, locale), [data.vehicles, locale, sort]);

  return <div className="fleet-page">
    <FleetHeader data={data} />
    <SchedulerStatus initialStatus={initialSchedulerStatus} timezone={dashboardTimezone(data)} />
    <Summary data={data} />
    {error ? <Alert type="error" showIcon message={t("dashboard.loadError")} action={<Button onClick={retry}>{t("common.retry")}</Button>} /> : null}
    <FleetToolbar query={query} groups={data.groups} hasUngrouped={data.hasUngrouped} sort={sort} loading={loading} onSearchCommit={commitSearch} onSet={set} onResetFilters={resetFilters} onSort={setSort} onRefresh={retry} />
    {screens.md ? <FleetTable vehicles={vehicles} columns={columns} loading={loading} emptyDescription={hasActiveFilters ? t("dashboard.emptyTitle") : t("dashboard.emptyFleetTitle")} emptyText={hasActiveFilters ? t("dashboard.emptyText") : t("dashboard.emptyFleetText")} /> : <FleetMobileList data={{ ...data, vehicles }} loading={loading} emptyDescription={hasActiveFilters ? t("dashboard.emptyTitle") : t("dashboard.emptyFleetTitle")} emptyText={hasActiveFilters ? t("dashboard.emptyText") : t("dashboard.emptyFleetText")} />}
  </div>;
}

function FleetHeader({ data }: Readonly<{ data: DashboardVehiclesResponse }>) { const { locale, t } = useI18n(); return <Flex vertical gap={4}><CompactPageHeading title={t("dashboard.title")} subtitle={t("dashboard.description")} /><Flex wrap="wrap" gap="middle"><MetadataItem label={t("dashboard.metadata.serviceDate")}><time dateTime={data.serviceDate}>{formatFleetServiceDate(data.serviceDate, locale)}</time></MetadataItem><MetadataItem label={t("dashboard.metadata.timezone")}>{data.timezone}</MetadataItem><MetadataItem label={t("dashboard.metadata.vehicles")}>{data.summary.total}</MetadataItem><MetadataItem label={t("dashboard.metadata.generated")}><time dateTime={data.generatedAt}>{formatFleetMetadataTimestamp(data.generatedAt, data.timezone, locale)}</time></MetadataItem></Flex></Flex>; }

function MetadataItem({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) { return <Text type="secondary">{label}: <Text strong>{children}</Text></Text>; }

function FleetToolbar({ query, groups, hasUngrouped, sort, loading, onSearchCommit, onSet, onResetFilters, onSort, onRefresh }: Readonly<{ query: DashboardQuery; groups: DashboardVehiclesResponse["groups"]; hasUngrouped: boolean; sort: FleetSort; loading: boolean; onSearchCommit: (value: string | undefined) => void; onSet: <K extends keyof DashboardQuery>(key: K, value: DashboardQuery[K]) => void; onResetFilters: () => void; onSort: (value: FleetSort) => void; onRefresh: () => void }>) {
  const { t } = useI18n();
  const { token } = theme.useToken();
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const statusOptions: readonly SelectOption[] = [{ value: "", label: t("dashboard.toolbar.statusAll") }, { value: "online", label: t("dashboard.status.online") }, { value: "offline", label: t("dashboard.status.offline") }, { value: "unknown", label: t("dashboard.status.unknown") }];
  const activityOptions: readonly SelectOption[] = [{ value: "", label: t("dashboard.toolbar.activityAll") }, { value: "below_threshold", label: t("dashboard.toolbar.activityBelowMinimum") }, { value: "normal", label: t("dashboard.toolbar.activityMeetsMinimum") }, { value: "no_data", label: t("dashboard.toolbar.activityNoData") }];
  const sortOptions: readonly SelectOption[] = [{ value: "name", label: t("dashboard.sort.name") }, { value: "freshness", label: t("dashboard.sort.freshness") }, { value: "speed", label: t("dashboard.sort.speed") }];
  const groupOptions: readonly SelectOption[] = [{ value: "", label: t("group.filter.allGroups") }, ...groups.map((group) => ({ value: group.id, label: group.name })), ...(hasUngrouped ? [{ value: "ungrouped", label: t("group.ungrouped") }] : [])];
  const showGroupFilter = groups.length > 0 || hasUngrouped;
  const activeFilterCount = Number(Boolean(query.status)) + Number(Boolean(query.activity)) + Number(query.includeDisabled === false) + Number(Boolean(query.group));
  const filterHeader = <Space size="small"><FilterFilled style={{ color: token.colorPrimary, fontSize: token.fontSizeSM }} aria-hidden /><Text strong>{t("dashboard.toolbar.filters")}</Text>{activeFilterCount > 0 ? <Text type="secondary">· {t(activeFilterCount === 1 ? "dashboard.toolbar.activeFiltersOne" : "dashboard.toolbar.activeFiltersMany", { count: activeFilterCount })}</Text> : null}</Space>;
  const reset = <ConfigProvider theme={{ token: { colorPrimaryBorder: token.colorTextQuaternary }, components: { Button: { defaultHoverBg: token.colorFillQuaternary, defaultHoverBorderColor: token.colorTextTertiary, defaultHoverColor: token.colorText, defaultActiveBg: token.colorFillTertiary, defaultActiveBorderColor: token.colorTextSecondary, defaultActiveColor: token.colorText } } }}><Button type="default" size="small" styles={{ root: { minHeight: 0 } }} disabled={activeFilterCount === 0} onClick={(event) => { event.stopPropagation(); onResetFilters(); }}>{t("dashboard.toolbar.resetFilters")}</Button></ConfigProvider>;
  const filters = <div className="fleet-toolbar__filter-controls">
    <LabeledFilterSelect fieldLabel={t("dashboard.filters.status")} ariaLabel={t("dashboard.filters.status")} value={query.status ?? ""} options={statusOptions} onChange={(value) => onSet("status", (value || undefined) as DashboardStatus | undefined)} />
    <LabeledFilterSelect fieldLabel={t("dashboard.filters.activity")} ariaLabel={t("dashboard.filters.activity")} value={query.activity ?? ""} options={activityOptions} onChange={(value) => onSet("activity", (value || undefined) as DashboardActivity | undefined)} />
    {showGroupFilter ? <LabeledFilterSelect fieldLabel={t("group.filter.label")} ariaLabel={t("group.filter.label")} value={query.group ?? ""} options={groupOptions} onChange={(value) => onSet("group", value || undefined)} /> : null}
    <Checkbox aria-label={t("dashboard.filters.showDisabledAria")} styles={{ root: { gap: 0, fontWeight: 400 }, icon: { overflow: "clip" } }} checked={query.includeDisabled !== false} onChange={(event) => onSet("includeDisabled", event.target.checked)}>{t("dashboard.filters.showDisabled")}</Checkbox>
  </div>;
  return <section className="fleet-toolbar" aria-label={t("dashboard.filters.label")} style={{ borderColor: token.colorBorder, borderRadius: token.borderRadiusLG, background: token.colorBgContainer, padding: token.paddingSM, paddingBottom: token.paddingXXS }}>
    <div className="fleet-toolbar__list-controls">
      <FleetSearchInput value={query.search} ariaLabel={t("dashboard.filters.search")} placeholder={t("dashboard.filters.searchPlaceholder")} onCommit={onSearchCommit} />
      <LabeledFilterSelect fieldLabel={t("dashboard.sort.label")} ariaLabel={t("dashboard.sort.label")} value={sort} options={sortOptions} onChange={(value) => onSort(value as FleetSort)} />
      <StableLoadingButton idleLabel={t("common.refresh")} loadingLabel={t("common.refreshing")} loading={loading} icon={<ReloadOutlined />} onClick={onRefresh} size="large" type="primary" />
    </div>
    <div className="fleet-toolbar__filters" style={{ borderTopColor: token.colorBorderSecondary }}>
      <Collapse ghost size="small" activeKey={activeKeys} onChange={(keys) => setActiveKeys(Array.isArray(keys) ? keys.map(String) : [String(keys)])} styles={{ header: { paddingInline: 0 }, body: { padding: `${token.paddingXS}px 0 ${token.paddingXS}px` } }} items={[{ key: "filters", label: filterHeader, extra: reset, children: filters }]} />
    </div>
  </section>;
}

function Summary({ data }: Readonly<{ data: DashboardVehiclesResponse }>) { const { t } = useI18n(); const { token } = theme.useToken(); return <section aria-label={t("dashboard.summary.label")}><Row gutter={[16, 16]}><Col xs={24} sm={12} xl={6}><Card className="fleet-summary-card" size="small" title={<SummaryTitle icon={<CarFilled style={{ fontSize: 15 }} aria-hidden />} title={t("dashboard.summary.total")} />} styles={{ root: { borderColor: token.colorBorder }, body: { display: "flex", alignItems: "center" } }}><Statistic value={data.summary.total} /></Card></Col><SummaryCard icon={<ApiFilled style={{ fontSize: 15 }} aria-hidden />} title={t("dashboard.summary.connection")} metrics={[{ label: t("dashboard.summary.online"), value: data.summary.online, status: "success" }, { label: t("dashboard.summary.offline"), value: data.summary.offline, status: "error" }, { label: t("dashboard.summary.unknown"), value: data.summary.unknown, status: "default" }]} /><SummaryCard icon={<AimOutlined style={{ fontSize: 16 }} aria-hidden />} title={t("dashboard.summary.gps")} metrics={[{ label: t("dashboard.summary.fresh"), value: data.summary.freshPositions, status: "success" }, { label: t("dashboard.summary.stale"), value: data.summary.stalePositions, status: "warning" }, { label: t("dashboard.summary.missing"), value: data.summary.withoutPosition, status: "default" }]} /><SummaryCard icon={<BarChartOutlined style={{ fontSize: 16 }} aria-hidden />} title={t("dashboard.summary.distance")} metrics={[{ label: t("dashboard.summary.belowMinimum"), value: data.summary.belowMinimumDistance, status: "warning" }, { label: t("dashboard.summary.withoutDistance"), value: data.summary.withoutDailyStat, status: "default" }]} /></Row></section>; }

function SummaryTitle({ icon, title }: Readonly<{ icon: ReactNode; title: string }>) { const { token } = theme.useToken(); return <Flex align="center" gap="small"><span className="fleet-summary-card__icon" style={{ color: token.colorPrimary, display: "inline-flex" }}>{icon}</span><span>{title}</span></Flex>; }

function SummaryCard({ icon, title, metrics }: Readonly<{ icon: ReactNode; title: string; metrics: readonly { label: string; value: number; status: "success" | "error" | "warning" | "default" }[] }>) { const { token } = theme.useToken(); return <Col xs={24} sm={12} xl={6}><Card className="fleet-summary-card" size="small" title={<SummaryTitle icon={icon} title={title} />} styles={{ root: { borderColor: token.colorBorder } }}><Flex vertical gap="small">{metrics.map((metric) => <Flex key={metric.label} justify="space-between" align="center" gap="small"><Space size="small"><Badge status={metric.status} /><Text type="secondary">{metric.label}:</Text></Space><Text strong>{metric.value}</Text></Flex>)}</Flex></Card></Col>; }

function FleetTable({ vehicles, columns, loading, emptyDescription, emptyText }: Readonly<{ vehicles: Vehicle[]; columns: TableColumnsType<Vehicle>; loading: boolean; emptyDescription: string; emptyText: string }>) {
  const { token } = theme.useToken();
  const headerCellStyle = { backgroundColor: token.colorBorderSecondary, borderBlockEnd: `${token.lineWidth}px ${token.lineType} ${token.colorBorder}`, fontSize: token.fontSize, fontWeight: token.fontWeightStrong, lineHeight: token.lineHeight, paddingBlock: token.paddingSM } as const;
  return <ConfigProvider theme={{ components: { Table: { cellPaddingInlineMD: token.paddingSM, headerBg: token.colorBorderSecondary, headerColor: token.colorTextHeading, headerSplitColor: token.colorBorderSecondary, rowHoverBg: token.colorFillTertiary } } }}>
    <Table<Vehicle> className="fleet-table" aria-label={useI18n().t("dashboard.table.label")} size="middle" tableLayout="auto" sticky={{ offsetHeader: 0 }} styles={{ root: { border: `${token.lineWidth}px ${token.lineType} ${token.colorBorder}`, borderRadius: token.borderRadiusLG, background: token.colorBgContainer, overflow: "hidden" }, header: { cell: headerCellStyle } }} rowKey="id" columns={columns} dataSource={vehicles} loading={loading} pagination={false} scroll={{ x: 960 }} locale={{ emptyText: <Empty description={emptyDescription}><Text type="secondary">{emptyText}</Text></Empty> }} />
  </ConfigProvider>;
}

function fleetColumns(data: DashboardVehiclesResponse, locale: ReturnType<typeof useI18n>["locale"], t: ReturnType<typeof useI18n>["t"]): TableColumnsType<Vehicle> { return [
  { title: t("dashboard.table.vehicle"), key: "vehicle", className: "fleet-table__vehicle-column", width: "1%", minWidth: 240, onCell: centeredFleetCell, render: (_, vehicle) => <VehicleIdentity vehicle={vehicle} disabledLabel={t("dashboard.vehicle.disabled")} table /> },
  { title: t("dashboard.table.status"), dataIndex: "status", key: "status", responsive: ["sm"], onCell: centeredFleetCell, render: (status: Vehicle["status"]) => <Badge status={status === "online" ? "success" : status === "offline" ? "error" : "default"} text={statusLabel(status, locale)} /> },
  { title: t("dashboard.table.gps"), key: "gps", onCell: centeredFleetCell, render: (_, vehicle) => <FleetGpsCell vehicle={vehicle} timezone={data.timezone} locale={locale} /> },
  { title: t("dashboard.table.currentSpeed"), dataIndex: "speedKph", key: "speed", align: "right", responsive: ["md"], onCell: centeredFleetCell, render: (value: Vehicle["speedKph"]) => <OptionalMetric value={value} formatted={formatSpeed(value, locale)} /> },
  { title: t("dashboard.table.dailyDistance"), dataIndex: "dailyDistanceMeters", key: "distance", align: "right", responsive: ["md"], onCell: centeredFleetCell, render: (value: Vehicle["dailyDistanceMeters"]) => <OptionalMetric value={value} formatted={formatDistance(value, locale)} /> },
  { title: t("dashboard.table.sourceQuality"), key: "sourceQuality", responsive: ["lg"], onCell: centeredFleetCell, render: (_, vehicle) => <SourceQuality vehicle={vehicle} locale={locale} /> },
  { title: t("dashboard.table.activity"), key: "activity", responsive: ["lg"], onCell: centeredFleetCell, render: (_, vehicle) => vehicle.belowMinimumDistance ? <Tag color="error">{t("dashboard.activity.belowThreshold")}</Tag> : vehicle.dailyDistanceMeters === null ? t("common.noData") : t("dashboard.activity.normal") },
]; }


function VehicleIdentity({ vehicle, disabledLabel, table = false }: Readonly<{ vehicle: Vehicle; disabledLabel: string; table?: boolean }>) { const { token } = theme.useToken(); return <span className={`fleet-vehicle-identity ${table ? "fleet-table__vehicle-identity" : "fleet-mobile__vehicle-identity"}`}><CarOutlined className="fleet-vehicle-link__car" style={{ color: token.colorTextTertiary }} aria-hidden /><span className="fleet-vehicle-identity__content"><VehicleDetailLink vehicle={vehicle} table={table} /><VehicleGroupTag group={vehicle.group} />{vehicle.disabled ? <DisabledVehicleTag label={disabledLabel} table={table} /> : null}</span></span>; }
function VehicleDetailLink({ vehicle, table = false }: Readonly<{ vehicle: Vehicle; table?: boolean }>) { return <Link className={`fleet-vehicle-link ${table ? "fleet-table__vehicle-link" : "fleet-mobile__vehicle-link"}`} href={`/vehicles/${vehicle.id}`}><Paragraph className="fleet-vehicle-link__name" style={{ color: "inherit", margin: 0 }} ellipsis={{ rows: vehicle.disabled ? 1 : 2, tooltip: vehicle.name }}>{vehicle.name}</Paragraph></Link>; }

function DisabledVehicleTag({ label, table }: Readonly<{ label: string; table: boolean }>) { return table ? <Tag className="fleet-table__disabled-tag" color="default" variant="filled">{label}</Tag> : <Tag className="fleet-mobile__disabled-tag">{label}</Tag>; }

const centeredFleetCell = () => ({ style: { verticalAlign: "middle" } });

function FleetGpsCell({ vehicle, timezone, locale }: Readonly<{ vehicle: Vehicle; timezone: string; locale: ReturnType<typeof useI18n>["locale"] }>) { const timestamp = formatFleetGpsTimestamp(vehicle.fixTime, timezone, locale); return <Space orientation="vertical" size={0}><Tag color={vehicle.positionFreshness === "fresh" ? "green" : vehicle.positionFreshness === "stale" ? "orange" : undefined}>{freshnessLabel(vehicle.positionFreshness, locale)}</Tag><Text className="fleet-table__numeric" type="secondary">{timestamp && vehicle.fixTime ? <time dateTime={vehicle.fixTime}>{timestamp}</time> : "—"}</Text></Space>; }

function OptionalMetric({ value, formatted }: Readonly<{ value: number | null; formatted: string }>) { return <Text className="fleet-table__numeric" type={value === null ? "secondary" : undefined}>{value === null ? "—" : formatted}</Text>; }

function SourceQuality({ vehicle, locale }: Readonly<{ vehicle: Vehicle; locale: ReturnType<typeof useI18n>["locale"] }>) { if (vehicle.dailyDistanceSource === null && vehicle.dailyDistanceQuality === null) return <Text type="secondary">—</Text>; return <Space orientation="vertical" size={0}>{vehicle.dailyDistanceSource === null ? <Text type="secondary">—</Text> : <Text>{sourceLabel(vehicle.dailyDistanceSource, locale)}</Text>}{vehicle.dailyDistanceQuality === null ? <Text type="secondary">—</Text> : <Text type="secondary">{qualityLabel(vehicle.dailyDistanceQuality, locale)}</Text>}</Space>; }

function sourceQualityText(vehicle: Vehicle, locale: ReturnType<typeof useI18n>["locale"], t: ReturnType<typeof useI18n>["t"]): string { return vehicle.dailyDistanceSource === null && vehicle.dailyDistanceQuality === null ? t("common.noData") : `${sourceLabel(vehicle.dailyDistanceSource, locale)} / ${qualityLabel(vehicle.dailyDistanceQuality, locale)}`; }

function FleetMobileList({ data, loading, emptyDescription, emptyText }: Readonly<{ data: DashboardVehiclesResponse; loading: boolean; emptyDescription: string; emptyText: string }>) { const { locale, t } = useI18n(); if (data.vehicles.length === 0) return <Empty description={emptyDescription}><Text type="secondary">{emptyText}</Text></Empty>; return <Spin spinning={loading}><Listy<Vehicle> items={data.vehicles} rowKey="id" itemRender={(vehicle) => <Flex vertical gap="small"><VehicleIdentity vehicle={vehicle} disabledLabel={t("dashboard.vehicle.disabled")} /><Space wrap><Badge status={vehicle.status === "online" ? "success" : vehicle.status === "offline" ? "error" : "default"} text={statusLabel(vehicle.status, locale)} /><Tag color={vehicle.positionFreshness === "fresh" ? "green" : vehicle.positionFreshness === "stale" ? "orange" : undefined}>{freshnessLabel(vehicle.positionFreshness, locale)}</Tag></Space><Flex wrap="wrap" gap="middle"><Text type="secondary">{t("dashboard.table.gps")}: {formatTimestamp(vehicle.fixTime, data.timezone, locale)}</Text><Text type="secondary">{t("dashboard.mobile.speed")}: {formatSpeed(vehicle.speedKph, locale)}</Text><Text type="secondary">{t("dashboard.mobile.distance")}: {formatDistance(vehicle.dailyDistanceMeters, locale)}</Text><Text type="secondary">{t("dashboard.table.sourceQuality")}: {sourceQualityText(vehicle, locale, t)}</Text></Flex></Flex>} /></Spin>; }
