"use client";

import { InfoCircleOutlined } from "@ant-design/icons";
import { Button, Popover, Tooltip } from "antd";
import { useI18n } from "../i18n/client";
import { formatNumber } from "../i18n/formatting";
import type { FleetActivityReportResponse } from "../lib/fleet-activity-report/fleet-activity-report-contract";
import { formatReportTimestamp } from "../lib/fleet-activity-report/fleet-activity-report-formatters";
import { formatObservedDistance, formatTripAnalysisDuration } from "../lib/trip-analysis/trip-analysis-formatters";

export function ReportPolicyContent({ data }: Readonly<{ data: FleetActivityReportResponse }>) {
  const { locale, t } = useI18n();
  const threshold = (seconds: number) => seconds % 60 === 0 ? formatTripAnalysisDuration(seconds, locale) : `${formatNumber(locale, seconds)} ${t("unit.secondShort")}`;
  const facts = [
    [t("reports.speedThreshold"), `${formatNumber(locale, data.policy.tripMovementSpeedKph)} ${t("unit.kilometresPerHour")}`],
    [t("reports.movementConfirmation"), threshold(data.policy.tripMovementConfirmationSeconds)],
    [t("reports.stopConfirmation"), threshold(data.policy.tripStopConfirmationSeconds)],
    [t("reports.gapThreshold"), threshold(data.policy.tripDataGapSeconds)],
    [t("reports.generated"), formatReportTimestamp(data.generatedAt, locale, data.timezone)],
    [t("reports.timezone"), data.timezone],
  ];
  return <div className="reports-policy" role="region" aria-label={t("reports.info")} tabIndex={0}><p>{t("reports.policyNote")}</p><dl className="reports-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="reports-muted">{t("reports.gapHelp", { duration: threshold(data.policy.tripDataGapSeconds) })}</p><p className="reports-muted">{t("reports.boundary")}</p></div>;
}

export function ReportSummary({ data }: Readonly<{ data: FleetActivityReportResponse }>) {
  const { locale, t } = useI18n();
  const metrics = [
    { title: t("reports.gps"), value: t("reports.gpsRatio", { withGps: data.summary.vehiclesWithGps, total: data.summary.vehicleCount }), help: t("reports.gpsHelp") },
    { title: t("trips.summary.trips"), value: formatNumber(locale, data.summary.tripCount) },
    { title: t("reports.distance"), value: formatObservedDistance(data.summary.totalObservedDistanceMeters, locale), help: t("reports.distanceHelp") },
    { title: t("reports.summary.tripTime"), value: formatTripAnalysisDuration(data.summary.totalTripDurationSeconds, locale) },
    { title: t("trips.summary.gaps"), value: formatNumber(locale, data.summary.gapCount), help: `${t("reports.gapDuration")}: ${formatTripAnalysisDuration(data.summary.totalGapDurationSeconds, locale)}` },
  ];
  return <section className="reports-summary" aria-label={t("reports.summary.label")} data-testid="reports-summary">
    <div className="reports-summary__context"><span>{t("reports.fleetScope")}</span><Popover trigger="click" placement="bottomRight" title={t("reports.info")} content={<ReportPolicyContent data={data} />} styles={{ container: { width: 460, maxWidth: "calc(100vw - 48px)", maxHeight: "min(520px, 60dvh)", overflowY: "auto" } }}><Button type="text" size="small" icon={<InfoCircleOutlined />} aria-label={t("reports.info")}>{t("reports.info")}</Button></Popover></div>
    <dl className="reports-summary__metrics">{metrics.map((metric) => <div key={metric.title}><dt>{metric.title}{metric.help && <Tooltip trigger={["hover", "focus"]} title={metric.help}><button className="reports-info-button" type="button" aria-label={metric.help}><InfoCircleOutlined /></button></Tooltip>}</dt><dd>{metric.value}</dd></div>)}</dl>
  </section>;
}
