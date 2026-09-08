"use client";

import Link from "next/link";
import { CarOutlined, ClockCircleOutlined, EnvironmentOutlined, HistoryOutlined, MoreOutlined, NodeIndexOutlined, PauseCircleOutlined, RightOutlined } from "@ant-design/icons";
import { Button, ConfigProvider, Dropdown, Table, Tooltip, theme } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useI18n } from "../i18n/client";
import { formatNumber } from "../i18n/formatting";
import type { AuthUser } from "../lib/auth/auth-contract";
import { hasPermission } from "../lib/auth/auth-contract";
import type { FleetActivityReportResponse, FleetActivityVehicleRow } from "../lib/fleet-activity-report/fleet-activity-report-contract";
import { formatReportTimestamp } from "../lib/fleet-activity-report/fleet-activity-report-formatters";
import { nextReportSort, reportSortDirection, reportVehicleActions, type ReportFilters, type ReportSort } from "../lib/fleet-activity-report/fleet-activity-report-ui-model";
import { formatObservedDistance, formatTripAnalysisDuration } from "../lib/trip-analysis/trip-analysis-formatters";

type Row = FleetActivityVehicleRow;
type Context = Readonly<{ data: FleetActivityReportResponse; user: AuthUser | null }>;

export function ReportVehicleIdentity({ row, user }: Readonly<{ row: Row; user: AuthUser | null }>) {
  return user && hasPermission(user, "vehicles.view") ? <Link className="reports-vehicle-link" href={`/vehicles/${row.vehicleId}`}><CarOutlined aria-hidden /><span>{row.vehicleName}</span></Link> : <strong>{row.vehicleName}</strong>;
}

export function ReportActions({ row, data, user, expanded = false }: Context & Readonly<{ row: Row; expanded?: boolean }>) {
  const { t } = useI18n();
  const actions = reportVehicleActions(row.vehicleId, data, user);
  if (!actions.length) return null;
  const items = actions.map((action) => ({ key: action.key, disabled: action.disabled, label: action.disabled ? <span title={t("reports.emptyInterval")}>{t(`reports.action.${action.key}`)}</span> : <Link href={action.href}>{t(`reports.action.${action.key}`)}</Link> }));
  if (expanded) return <nav className="reports-investigation" aria-label={t("reports.actions", { vehicle: row.vehicleName })}>{actions.map((action) => <Button size="large" icon={action.key === "vehicle" ? <CarOutlined /> : action.key === "trips" ? <NodeIndexOutlined /> : action.key === "history" ? <HistoryOutlined /> : <EnvironmentOutlined />} key={action.key} href={action.disabled ? undefined : action.href} disabled={action.disabled} title={action.disabled ? t("reports.emptyInterval") : undefined}>{t(`reports.action.${action.key}`)}</Button>)}</nav>;
  return <Dropdown trigger={["click"]} menu={{ items }}><Button type="text" icon={<MoreOutlined />} aria-label={t("reports.actions", { vehicle: row.vehicleName })} /></Dropdown>;
}

export function ReportRowFacts({ row, data }: Readonly<{ row: Row; data: FleetActivityReportResponse }>) {
  const { locale, t } = useI18n();
  const number = (value: number) => row.hasGpsData ? formatNumber(locale, value) : "—";
  const duration = (value: number) => row.hasGpsData ? formatTripAnalysisDuration(value, locale) : "—";
  const facts = [
    [t("reports.observationCount"), number(row.rawObservationCount)],
    [t("reports.first"), formatReportTimestamp(row.firstObservationAt, locale, data.timezone)],
    [t("reports.last"), formatReportTimestamp(row.lastObservationAt, locale, data.timezone)],
    [t("trips.summary.trips"), number(row.tripCount)],
    [t("reports.distance"), row.hasGpsData ? formatObservedDistance(row.observedDistanceMeters, locale) : "—"],
    [t("reports.summary.tripTime"), duration(row.tripDurationSeconds)],
    [t("reports.stops"), number(row.stopCount)],
    [t("reports.table.stopTime"), duration(row.stopDurationSeconds)],
    [t("trips.summary.gaps"), number(row.gapCount)],
    [t("reports.gapDuration"), duration(row.gapDurationSeconds)],
  ];
  return <>{!row.hasGpsData && <p className="reports-muted">{t("reports.noGps")}</p>}<dl className="reports-facts vehicle-overview__metric-rows">{facts.map(([label, value]) => <div className="vehicle-overview__metric-row" key={label}><dt>{label}:</dt><dd>{value}</dd></div>)}</dl></>;
}

export function ReportResults({ data, rows, user, desktop, sort, direction, onSort, onSelect }: Context & Readonly<{
  rows: readonly Row[]; desktop: boolean; sort: ReportSort; direction?: ReportFilters["direction"]; onSort: (sort: Pick<ReportFilters, "sort" | "direction">) => void; onSelect: (row: Row, trigger: HTMLButtonElement) => void;
}>) {
  const { locale, t } = useI18n();
  const { token } = theme.useToken();
  const count = (row: Row, value: number) => row.hasGpsData ? formatNumber(locale, value) : "—";
  const duration = (row: Row, value: number) => row.hasGpsData ? formatTripAnalysisDuration(value, locale) : "—";
  const threshold = (seconds: number) => seconds % 60 === 0 ? formatTripAnalysisDuration(seconds, locale) : `${formatNumber(locale, seconds)} ${t("unit.secondShort")}`;
  const sortable = (key: ReportSort) => ({ key, sorter: true, sortDirections: key === "name" ? ["ascend" as const, "descend" as const] : key === "distance" ? ["descend" as const, "ascend" as const, "descend" as const] : ["descend" as const, "ascend" as const], sortOrder: sort === key ? reportSortDirection({ sort, direction }) : null });
  const columns: ColumnsType<Row> = [
    { title: t("reports.table.vehicle"), ...sortable("name"), width: "24%", render: (_, row) => <div className="reports-identity"><ReportVehicleIdentity row={row} user={user} />{row.hasGpsData ? <Tooltip trigger={["hover", "focus"]} title={<>{t("reports.first")}: {formatReportTimestamp(row.firstObservationAt, locale, data.timezone)}<br />{t("reports.last")}: {formatReportTimestamp(row.lastObservationAt, locale, data.timezone)}</>}><button type="button" className="reports-evidence">{t("reports.observations", { count: formatNumber(locale, row.rawObservationCount) })}</button></Tooltip> : <span className="reports-muted">{t("reports.noGps")}</span>}</div> },
    { title: t("trips.summary.trips"), ...sortable("trips"), align: "right", className: "reports-numeric", render: (_, row) => count(row, row.tripCount) },
    { title: <Tooltip trigger={["hover", "focus"]} title={t("reports.distanceHelp")}>{t("reports.distance")}</Tooltip>, ...sortable("distance"), align: "right", className: "reports-numeric", render: (_, row) => row.hasGpsData ? formatObservedDistance(row.observedDistanceMeters, locale) : "—" },
    { title: t("reports.summary.tripTime"), ...sortable("tripTime"), align: "right", className: "reports-numeric", render: (_, row) => duration(row, row.tripDurationSeconds) },
    { title: <Tooltip trigger={["hover", "focus"]} title={t("reports.stopHelp", { duration: threshold(data.policy.tripStopConfirmationSeconds) })}>{t("reports.stops")}</Tooltip>, ...sortable("stops"), align: "right", className: "reports-numeric", render: (_, row) => count(row, row.stopCount) },
    { title: t("reports.table.stopTime"), ...sortable("stopTime"), align: "right", className: "reports-numeric", render: (_, row) => duration(row, row.stopDurationSeconds) },
    { title: <Tooltip trigger={["hover", "focus"]} title={t("reports.gapHelp", { duration: threshold(data.policy.tripDataGapSeconds) })}>{t("trips.summary.gaps")}</Tooltip>, ...sortable("gaps"), align: "right", className: "reports-numeric", render: (_, row) => <span className="reports-gap">{count(row, row.gapCount)}{row.hasGpsData && row.gapCount > 0 && <small className="reports-muted">{duration(row, row.gapDurationSeconds)}</small>}</span> },
    { title: <span className="reports-sr-only">{t("reports.comparison")}</span>, key: "actions", width: 44, render: (_, row) => <ReportActions row={row} data={data} user={user} /> },
  ];
  if (desktop) return <div className="reports-table" role="region" aria-label={t("reports.comparison")} tabIndex={0} data-testid="reports-table">
    <ConfigProvider theme={{ components: { Table: { headerBg: token.colorFillQuaternary, headerColor: token.colorTextHeading, headerSplitColor: "transparent", headerSortActiveBg: token.colorFillQuaternary, headerSortHoverBg: token.colorFillTertiary, bodySortBg: token.colorBgContainer, rowHoverBg: token.colorFillQuaternary, borderColor: token.colorBorderSecondary, cellPaddingBlockSM: 10, cellPaddingInlineSM: 12, headerBorderRadius: 0 } } }}>
      <Table<Row> aria-label={t("reports.comparison")} rowKey="vehicleId" columns={columns} dataSource={[...rows]} pagination={false} size="small" sticky={{ offsetHeader: 0 }} tableLayout="fixed" showSorterTooltip={false} onChange={(_, __, next) => { const sorter = Array.isArray(next) ? next[0] : next; onSort(nextReportSort({ sort, direction }, sorter.columnKey as ReportSort)); }} />
    </ConfigProvider>
  </div>;
  return <ul className="reports-comparison-list" aria-label={t("reports.comparison")} data-testid="reports-list">{rows.map((row) => <li className="reports-comparison-row" key={row.vehicleId}>
    <div className="reports-comparison-row__identity"><ReportVehicleIdentity row={row} user={user} /></div>
    <button type="button" className="reports-comparison-row__select" aria-label={t("reports.details", { vehicle: row.vehicleName })} onClick={(event) => onSelect(row, event.currentTarget)}>
      {row.hasGpsData ? <><div className="reports-comparison-row__metrics"><span aria-label={t("trips.summary.trips")}><CarOutlined aria-hidden /><strong>{formatNumber(locale, row.tripCount)}</strong><span className="reports-muted">{t("trips.summary.trips")}</span></span><strong className="reports-comparison-row__distance" aria-label={t("reports.distance")}>{formatObservedDistance(row.observedDistanceMeters, locale)}</strong><span aria-label={t("reports.summary.tripTime")}><ClockCircleOutlined aria-hidden />{formatTripAnalysisDuration(row.tripDurationSeconds, locale)}</span><span aria-label={t("reports.stops")}><PauseCircleOutlined aria-hidden /><strong>{formatNumber(locale, row.stopCount)}</strong><span className="reports-muted">{t("reports.stops")}</span></span></div><span className="reports-comparison-row__evidence">{t("reports.observations", { count: formatNumber(locale, row.rawObservationCount) })} · {t("trips.summary.gaps")}: {formatNumber(locale, row.gapCount)}</span></> : <span className="reports-muted">{t("reports.noGps")}</span>}
      <RightOutlined className="reports-comparison-row__chevron" />
    </button>
  </li>)}</ul>;
}
