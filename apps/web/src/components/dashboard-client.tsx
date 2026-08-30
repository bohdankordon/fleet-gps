"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Checkbox, Col, Empty, Flex, Grid, Input, Listy, Row, Select, Space, Spin, Statistic, Table, Tag } from "antd";
import type { TableColumnsType } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import Text from "antd/es/typography/Text";
import Title from "antd/es/typography/Title";
import type { DashboardVehiclesResponse } from "@/lib/dashboard/dashboard-contract";
import { dashboardTimezone, formatDistance, formatGeneratedAt, formatSpeed, formatTimestamp, freshnessLabel, qualityLabel, sourceLabel, statusLabel } from "@/lib/dashboard/dashboard-formatters";
import { dashboardHistoryPath, shouldUpdateDashboardHistory, type DashboardNavigationReason } from "@/lib/dashboard/dashboard-navigation";
import { parseDashboardQuery, serializeDashboardQuery, type DashboardActivity, type DashboardQuery, type DashboardStatus } from "@/lib/dashboard/dashboard-query";
import type { SchedulerStatusResponse } from "@/lib/scheduler/scheduler-contract";
import { SchedulerStatus } from "./scheduler-status";
import { useI18n } from "../i18n/client";

type Props = Readonly<{ initialData: DashboardVehiclesResponse; initialQuery: DashboardQuery; initialSchedulerStatus: SchedulerStatusResponse | null }>;
type Vehicle = DashboardVehiclesResponse["vehicles"][number];

export function DashboardClient({ initialData, initialQuery, initialSchedulerStatus }: Props) {
  const { locale, t } = useI18n(); const screens = Grid.useBreakpoint();
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
  const hasActiveFilters = Boolean(query.search || query.status || query.activity || query.includeDisabled === false);
  const columns = fleetColumns(data, locale, t);

  return <div className="fleet-page">
    <FleetHeader data={data} />
    <SchedulerStatus initialStatus={initialSchedulerStatus} timezone={dashboardTimezone(data)} />
    <Card>
      <Flex className="fleet-toolbar" gap="middle" wrap="wrap" align="end" aria-label={t("dashboard.filters.label")}>
        <Space className="fleet-toolbar__search" orientation="vertical" size="small"><Text>{t("dashboard.filters.search")}</Text><Input.Search allowClear value={query.search ?? ""} onChange={(event) => set("search", event.target.value || undefined)} placeholder={t("dashboard.filters.searchPlaceholder")} /></Space>
        <Space className="fleet-toolbar__select" orientation="vertical" size="small"><Text>{t("dashboard.filters.status")}</Text><Select value={query.status ?? ""} onChange={(value) => set("status", (value || undefined) as DashboardStatus | undefined)} options={[{ value: "", label: t("common.all") }, { value: "online", label: t("dashboard.status.online") }, { value: "offline", label: t("dashboard.status.offline") }, { value: "unknown", label: t("dashboard.status.unknown") }]} /></Space>
        <Space className="fleet-toolbar__select" orientation="vertical" size="small"><Text>{t("dashboard.filters.activity")}</Text><Select value={query.activity ?? ""} onChange={(value) => set("activity", (value || undefined) as DashboardActivity | undefined)} options={[{ value: "", label: t("common.all") }, { value: "below_threshold", label: t("dashboard.activity.belowThreshold") }, { value: "normal", label: t("dashboard.activity.normalDistance") }, { value: "no_data", label: t("dashboard.activity.noData") }]} /></Space>
        <Checkbox checked={query.includeDisabled !== false} onChange={(event) => set("includeDisabled", event.target.checked)}>{t("dashboard.filters.showDisabled")}</Checkbox>
        <Button type="primary" icon={<ReloadOutlined />} loading={loading} onClick={retry}>{loading ? t("common.refreshing") : t("common.refresh")}</Button>
      </Flex>
    </Card>
    {error ? <Alert type="error" showIcon message={t("dashboard.loadError")} action={<Button onClick={retry}>{t("common.retry")}</Button>} /> : null}
    <Summary data={data} />
    {screens.md ? <Table<Vehicle> aria-label={t("dashboard.table.label")} size="middle" rowKey="id" columns={columns} dataSource={data.vehicles} loading={loading} pagination={false} scroll={{ x: 960 }} locale={{ emptyText: <Empty description={hasActiveFilters ? t("dashboard.emptyTitle") : t("dashboard.emptyFleetTitle")}><Text type="secondary">{hasActiveFilters ? t("dashboard.emptyText") : t("dashboard.emptyFleetText")}</Text></Empty> }} /> : <FleetMobileList data={data} loading={loading} emptyDescription={hasActiveFilters ? t("dashboard.emptyTitle") : t("dashboard.emptyFleetTitle")} emptyText={hasActiveFilters ? t("dashboard.emptyText") : t("dashboard.emptyFleetText")} />}
  </div>;
}

function FleetHeader({ data }: Readonly<{ data: DashboardVehiclesResponse }>) { const { locale, t } = useI18n(); return <Flex vertical gap="small"><div><Text type="secondary">{t("dashboard.eyebrow")}</Text><Title level={1}>{t("dashboard.title")}</Title><Text type="secondary">{t("dashboard.description")}</Text></div><Flex wrap="wrap" gap="middle"><Text type="secondary">{t("dashboard.metadata.serviceDate")}: <Text strong>{data.serviceDate}</Text></Text><Text type="secondary">{t("dashboard.metadata.timezone")}: <Text strong>{data.timezone}</Text></Text><Text type="secondary">{t("dashboard.metadata.vehicles")}: <Text strong>{data.summary.total}</Text></Text><Text type="secondary">{t("dashboard.metadata.generated")}: <time dateTime={data.generatedAt}>{formatGeneratedAt(data.generatedAt, data.timezone, locale)}</time></Text></Flex></Flex>; }

function Summary({ data }: Readonly<{ data: DashboardVehiclesResponse }>) { const { t } = useI18n(); const metrics = [{ label: t("dashboard.summary.total"), value: data.summary.total }, { label: t("dashboard.summary.online"), value: data.summary.online }, { label: t("dashboard.summary.offline"), value: data.summary.offline }, { label: t("dashboard.summary.fresh"), value: data.summary.freshPositions }, { label: t("dashboard.summary.stale"), value: data.summary.stalePositions }, { label: t("dashboard.summary.unknown"), value: data.summary.unknown }, { label: t("dashboard.summary.missing"), value: data.summary.withoutPosition }, { label: t("dashboard.summary.belowMinimum"), value: data.summary.belowMinimumDistance }, { label: t("dashboard.summary.withoutDistance"), value: data.summary.withoutDailyStat }]; return <section aria-label={t("dashboard.summary.label")}><Row gutter={[16, 16]}>{metrics.map((metric) => <Col key={metric.label} xs={12} sm={8} lg={6} xl={4}><Card><Statistic title={metric.label} value={metric.value} /></Card></Col>)}</Row></section>; }

function fleetColumns(data: DashboardVehiclesResponse, locale: ReturnType<typeof useI18n>["locale"], t: ReturnType<typeof useI18n>["t"]): TableColumnsType<Vehicle> { return [
  { title: t("dashboard.table.vehicle"), key: "vehicle", render: (_, vehicle) => <Space orientation="vertical" size={0}><Link href={`/vehicles/${vehicle.id}`}>{vehicle.name}</Link>{vehicle.disabled ? <Tag>{t("dashboard.vehicle.disabled")}</Tag> : null}</Space> },
  { title: t("dashboard.table.status"), dataIndex: "status", key: "status", responsive: ["sm"], render: (status: Vehicle["status"]) => <Badge status={status === "online" ? "success" : status === "offline" ? "error" : "default"} text={statusLabel(status, locale)} /> },
  { title: t("dashboard.table.gps"), key: "gps", render: (_, vehicle) => <Space orientation="vertical" size={0}><Tag color={vehicle.positionFreshness === "fresh" ? "green" : vehicle.positionFreshness === "stale" ? "orange" : undefined}>{freshnessLabel(vehicle.positionFreshness, locale)}</Tag><Text type="secondary">{formatTimestamp(vehicle.fixTime, data.timezone, locale)}</Text></Space> },
  { title: t("dashboard.table.currentSpeed"), dataIndex: "speedKph", key: "speed", align: "right", responsive: ["md"], render: (value: Vehicle["speedKph"]) => formatSpeed(value, locale) },
  { title: t("dashboard.table.dailyDistance"), dataIndex: "dailyDistanceMeters", key: "distance", align: "right", responsive: ["md"], render: (value: Vehicle["dailyDistanceMeters"]) => formatDistance(value, locale) },
  { title: t("dashboard.table.sourceQuality"), key: "sourceQuality", responsive: ["lg"], render: (_, vehicle) => <Space orientation="vertical" size={0}><Text>{sourceLabel(vehicle.dailyDistanceSource, locale)}</Text><Text type="secondary">{qualityLabel(vehicle.dailyDistanceQuality, locale)}</Text></Space> },
  { title: t("dashboard.table.activity"), key: "activity", responsive: ["lg"], render: (_, vehicle) => vehicle.belowMinimumDistance ? <Tag color="error">{t("dashboard.activity.belowThreshold")}</Tag> : vehicle.dailyDistanceMeters === null ? t("common.noData") : t("dashboard.activity.normal") },
]; }

function FleetMobileList({ data, loading, emptyDescription, emptyText }: Readonly<{ data: DashboardVehiclesResponse; loading: boolean; emptyDescription: string; emptyText: string }>) { const { locale, t } = useI18n(); if (data.vehicles.length === 0) return <Empty description={emptyDescription}><Text type="secondary">{emptyText}</Text></Empty>; return <Spin spinning={loading}><Listy<Vehicle> items={data.vehicles} rowKey="id" itemRender={(vehicle) => <Flex vertical gap="small"><Flex justify="space-between" gap="small"><Link href={`/vehicles/${vehicle.id}`}>{vehicle.name}</Link>{vehicle.disabled ? <Tag>{t("dashboard.vehicle.disabled")}</Tag> : null}</Flex><Space wrap><Badge status={vehicle.status === "online" ? "success" : vehicle.status === "offline" ? "error" : "default"} text={statusLabel(vehicle.status, locale)} /><Tag color={vehicle.positionFreshness === "fresh" ? "green" : vehicle.positionFreshness === "stale" ? "orange" : undefined}>{freshnessLabel(vehicle.positionFreshness, locale)}</Tag></Space><Flex wrap="wrap" gap="middle"><Text type="secondary">{t("dashboard.table.gps")}: {formatTimestamp(vehicle.fixTime, data.timezone, locale)}</Text><Text type="secondary">{t("dashboard.mobile.speed")}: {formatSpeed(vehicle.speedKph, locale)}</Text><Text type="secondary">{t("dashboard.mobile.distance")}: {formatDistance(vehicle.dailyDistanceMeters, locale)}</Text><Text type="secondary">{t("dashboard.table.sourceQuality")}: {sourceLabel(vehicle.dailyDistanceSource, locale)} / {qualityLabel(vehicle.dailyDistanceQuality, locale)}</Text></Flex></Flex>} /></Spin>; }
