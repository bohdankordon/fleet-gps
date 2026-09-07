"use client";

import { ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Drawer, Empty, Grid, Input, Select, Skeleton, Spin, theme } from "antd";
import { useRef, useState, type CSSProperties } from "react";
import { useI18n } from "../i18n/client";
import type { ReportPageState } from "../lib/fleet-activity-report/fleet-activity-report-page-loader";
import { formatReportDay, formatReportWindow } from "../lib/fleet-activity-report/fleet-activity-report-formatters";
import { DEFAULT_REPORT_FILTERS, REPORT_SORTS, reportControlsChanged, reportFilterCount, visibleReportVehicles, type ReportFilters } from "../lib/fleet-activity-report/fleet-activity-report-ui-model";
import { useAuth } from "./auth-provider";
import { CompactPageHeading } from "./compact-page-heading";
import { FleetFilterResetButton } from "./fleet-filter-reset-button";
import { StableLoadingButton } from "./stable-loading-button";
import { ReportPeriod } from "./report-period";
import { ReportSummary } from "./report-context";
import { ReportActions, ReportResults, ReportRowFacts, ReportVehicleIdentity } from "./report-results";

type Props = ReportPageState & Readonly<{ pending: boolean; onDate: (date: string) => void; onRefresh: () => void }>;

export function FleetActivityReportWorkspace({ initialData: data, initialDate, initialRange, initialError, timezone, now, pending, onDate, onRefresh }: Props) {
  const { locale, t } = useI18n();
  const user = useAuth();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_REPORT_FILTERS);
  const [selected, setSelected] = useState<{ id: string; context: string } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const context = data ? `${data.from}/${data.to}/${data.generatedAt}` : "";
  const selectedRow = selected?.context === context ? data?.vehicles.find((row) => row.vehicleId === selected.id) : undefined;
  const rows = data ? visibleReportVehicles(data.vehicles, filters, locale) : [];
  const filterCount = reportFilterCount(filters);
  const reset = () => setFilters(DEFAULT_REPORT_FILTERS);
  const variables = { "--reports-surface": token.colorBgContainer, "--reports-border": token.colorBorderSecondary, "--reports-muted": token.colorTextSecondary, "--reports-text": token.colorText, "--reports-fill": token.colorFillQuaternary, "--reports-radius": `${token.borderRadiusLG}px`, "--reports-primary": token.colorPrimary } as CSSProperties;
  return <div className="reports-workspace" style={variables} data-testid="reports-workspace">
    <header className="reports-heading"><div><CompactPageHeading title={t("reports.title")} subtitle={t("reports.description")} /></div><StableLoadingButton idleLabel={t("reports.refresh")} loadingLabel={t("reports.loading")} loading={pending} icon={<ReloadOutlined />} onClick={onRefresh} showLabel={screens.sm !== false} /></header>
    {initialDate && initialRange && timezone && <ReportPeriod key={`${initialDate}/${initialRange.to}/${timezone}`} date={initialDate} range={initialRange} now={now} timezone={timezone} pending={pending} onDate={onDate} />}
    <div className="reports-live" role="status" aria-live="polite">{pending ? t("reports.pending") : ""}</div>
    {initialError && <Alert type="error" showIcon title={t("reports.loadError")} description={initialError === "context" ? t("reports.contextError") : t("reports.loadErrorText")} action={<Button onClick={onRefresh} loading={pending}>{t("reports.retry")}</Button>} />}
    {data && <Spin spinning={pending}><div aria-busy={pending} className={pending ? "reports-content reports-content--pending" : "reports-content"}>
      <ReportSummary data={data} />
      {data.summary.vehicleCount > 0 && data.summary.vehiclesWithGps === 0 && <p role="status" className="reports-no-data">{t("reports.noGpsDay")}</p>}
      <section className="reports-results" aria-label={t("reports.comparison")}>
        <div className="reports-toolbar" role="search" aria-label={t("reports.filters")}>
          <Input className="reports-search" aria-label={t("reports.search")} placeholder={t("reports.search")} allowClear value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
          <Select className="reports-gps-filter" aria-label={t("reports.gpsFilter")} labelRender={({ value, label }) => value === "ALL" ? t("reports.allGps") : label} value={filters.gps} onChange={(gps) => setFilters({ ...filters, gps })} options={[{ value: "ALL", label: t("reports.all") }, { value: "WITH_GPS", label: t("reports.withGps") }, { value: "NO_GPS", label: t("reports.noGps") }]} />
          <Select className="reports-sort" aria-label={t("reports.sort")} value={filters.sort} onChange={(sort) => setFilters({ ...filters, sort })} options={REPORT_SORTS.map((sort) => ({ value: sort, label: t(`reports.sort.${sort}`) }))} />
          <div className="reports-reset"><span className="reports-muted">{t("reports.filterCount", { count: filterCount })}</span><FleetFilterResetButton disabled={!reportControlsChanged(filters)} onClick={reset}>{t("reports.reset")}</FleetFilterResetButton></div>
        </div>
        <div className="reports-results__context" role="status"><span>{t("reports.visible", { visible: rows.length, total: data.vehicles.length })}</span>{filterCount > 0 && <span>{t("reports.subset")}</span>}</div>
        {data.vehicles.length === 0 ? <div className="reports-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><strong>{t("reports.emptyFleet")}</strong><p>{t("reports.emptyFleetText")}</p></>} /></div> : rows.length === 0 ? <div className="reports-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><strong>{t("reports.filteredEmpty")}</strong><p>{t("reports.filteredEmptyText")}</p></>}><Button onClick={reset}>{t("reports.reset")}</Button></Empty></div> : <ReportResults data={data} rows={rows} user={user} desktop={!!screens.lg} sort={filters.sort} onSort={(sort) => setFilters({ ...filters, sort })} onSelect={(row, button) => { trigger.current = button; setSelected({ id: row.vehicleId, context }); }} />}
      </section>
    </div></Spin>}
    <Drawer title={selectedRow ? t("reports.details", { vehicle: selectedRow.vehicleName }) : t("reports.comparison")} open={!!selectedRow && !screens.lg} onClose={() => setSelected(null)} size={screens.sm ? 520 : "100%"} destroyOnHidden focusable={{ trap: true, focusTriggerAfterClose: false }} keyboard afterOpenChange={(open) => { if (!open && trigger.current?.isConnected) trigger.current.focus({ preventScroll: true }); }}>
      {selectedRow && data && initialDate && <div className="reports-drawer" style={variables}><ReportVehicleIdentity row={selectedRow} user={user} /><p>{formatReportDay(initialDate, locale, data.timezone)}<br /><span className="reports-muted">{formatReportWindow(data.from, data.to, locale, data.timezone)} · {data.timezone}</span></p><ReportRowFacts row={selectedRow} data={data} /><ReportActions row={selectedRow} data={data} user={user} expanded /></div>}
    </Drawer>
  </div>;
}

export function ReportsLoading() {
  const { t } = useI18n();
  return <div className="reports-workspace" role="status" aria-label={t("reports.loading")}><div className="reports-heading"><div><CompactPageHeading title={t("reports.title")} subtitle={t("reports.description")} /></div></div><Skeleton active paragraph={{ rows: 4 }} title={false} /></div>;
}
