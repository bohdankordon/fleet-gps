"use client";

import { AimOutlined, CarOutlined, ClockCircleOutlined, DisconnectOutlined, InfoCircleOutlined, NodeIndexOutlined } from "@ant-design/icons";
import { Button, Popover, Tooltip, Typography } from "antd";
import { useI18n } from "../i18n/client";
import { formatNumber } from "../i18n/formatting";
import type { FleetActivityReportResponse } from "../lib/fleet-activity-report/fleet-activity-report-contract";
import { formatReportTimestamp } from "../lib/fleet-activity-report/fleet-activity-report-formatters";
import { formatObservedDistance, formatTripAnalysisDuration } from "../lib/trip-analysis/trip-analysis-formatters";

export function ReportPolicyContent({ data }: Readonly<{ data: FleetActivityReportResponse }>) {
  const { locale, t } = useI18n();
  const threshold = (seconds: number) => seconds % 60 === 0 ? formatTripAnalysisDuration(seconds, locale) : `${formatNumber(locale, seconds)} ${t("unit.secondShort")}`;
  const analytics = [
    [t("reports.speedThreshold"), `${formatNumber(locale, data.policy.tripMovementSpeedKph)} ${t("unit.kilometresPerHour")}`],
    [t("reports.movementConfirmation"), threshold(data.policy.tripMovementConfirmationSeconds)],
    [t("reports.stopConfirmation"), threshold(data.policy.tripStopConfirmationSeconds)],
    [t("reports.gapThreshold"), threshold(data.policy.tripDataGapSeconds)],
  ];
  const context = [
    [t("reports.generated"), formatReportTimestamp(data.generatedAt, locale, data.timezone)],
    [t("reports.timezone"), data.timezone],
  ];
  const sections = [
    { title: t("reports.policy.analytics"), facts: analytics },
    { title: t("reports.policy.context"), facts: context },
  ];
  const notes = [t("reports.subset"), t("reports.gapHelp", { duration: threshold(data.policy.tripDataGapSeconds) }), t("reports.policyNote"), t("reports.boundary")];
  return <div className="reports-policy" role="region" aria-label={t("reports.info")} tabIndex={0}>
    <p className="reports-policy__intro">{t("reports.policy.intro")}</p>
    {sections.map((section) => <section className="reports-policy__section" aria-label={section.title} key={section.title}>
      <h3 className="reports-policy__heading">{section.title}</h3>
      <dl className="reports-facts vehicle-overview__metric-rows">{section.facts.map(([label, value]) => <div className="vehicle-overview__metric-row" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </section>)}
    <section className="reports-policy__section" aria-label={t("reports.policy.important")}>
      <h3 className="reports-policy__heading">{t("reports.policy.important")}</h3>
      <ul className="reports-policy__notes">{notes.map((note) => <li key={note}>{note}</li>)}</ul>
    </section>
  </div>;
}

export function ReportMethodology({ data }: Readonly<{ data: FleetActivityReportResponse }>) {
  const { t } = useI18n();
  return <Popover trigger="click" placement="bottomRight" title={<h2 className="reports-policy__title">{t("reports.info")}</h2>} content={<ReportPolicyContent data={data} />} styles={{ container: { width: 460, maxWidth: "calc(100vw - 48px)", maxHeight: "min(520px, 60dvh)", overflowY: "auto" } }}><Button className="reports-methodology" type="default" size="large" icon={<InfoCircleOutlined />} aria-label={t("reports.info")}>{t("reports.info")}</Button></Popover>;
}

export function ReportSummary({ data }: Readonly<{ data: FleetActivityReportResponse }>) {
  const { locale, t } = useI18n();
  const metrics = [
    { icon: <AimOutlined />, title: t("reports.gps"), value: t("reports.gpsRatio", { withGps: data.summary.vehiclesWithGps, total: data.summary.vehicleCount }), help: t("reports.gpsHelp") },
    { icon: <CarOutlined />, title: t("trips.summary.trips"), value: formatNumber(locale, data.summary.tripCount) },
    { icon: <NodeIndexOutlined />, title: t("reports.distance"), value: formatObservedDistance(data.summary.totalObservedDistanceMeters, locale), help: t("reports.distanceHelp") },
    { icon: <ClockCircleOutlined />, title: t("reports.summary.tripTime"), value: formatTripAnalysisDuration(data.summary.totalTripDurationSeconds, locale) },
    { icon: <DisconnectOutlined />, title: t("trips.summary.gaps"), value: formatNumber(locale, data.summary.gapCount), help: `${t("reports.gapDuration")}: ${formatTripAnalysisDuration(data.summary.totalGapDurationSeconds, locale)}` },
  ];
  return <section className="reports-summary" aria-label={t("reports.summary.label")} data-testid="reports-summary" aria-describedby="reports-summary-scope">
    <span id="reports-summary-scope" className="reports-sr-only">{t("reports.subset")}</span>
    <div className="reports-summary__metrics vehicle-trips__summary">{metrics.map((metric) => <article className="vehicle-trips__summary-metric" key={metric.title}><span className="vehicle-trips__summary-icon" aria-hidden>{metric.icon}</span><div className="vehicle-trips__summary-content"><span className="vehicle-trips__summary-title">{metric.title}{metric.help && <Tooltip trigger={["hover", "focus"]} title={metric.help}><button className="reports-info-button" type="button" aria-label={metric.help}><InfoCircleOutlined /></button></Tooltip>}</span><Typography.Text className="vehicle-trips__summary-value" strong>{metric.value}</Typography.Text></div></article>)}</div>
  </section>;
}
