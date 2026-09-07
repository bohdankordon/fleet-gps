"use client";

import { Button, Tag, Typography } from "antd";
import { CloseOutlined, DashboardOutlined, PauseCircleOutlined } from "@ant-design/icons";
import type { AlertEvent } from "../lib/alert-events/alert-events-contract";
import { alertStatusLabel, alertTypeLabel, alertZoneLabel, formatAlertDistance, formatAlertSpeed, formatAlertTimestamp } from "../lib/alert-events/alert-events-formatters";
import { alertEventActions } from "../lib/alert-events/alert-events-investigation";
import { formatUnit } from "../i18n/formatting";
import { useI18n } from "../i18n/client";
import { useAuth } from "./auth-provider";

export function EventDetail({ event, onClose, now }: Readonly<{ event: AlertEvent; onClose: () => void; now: Date }>) {
  const { locale, t } = useI18n(); const user = useAuth();
  const actions = alertEventActions(event, user, now);
  const metrics = event.type === "SPEEDING" ? [
    [t("events.zone"), alertZoneLabel(event.details.zone, locale)],
    [t("events.threshold"), formatAlertSpeed(event.details.thresholdKph, locale)],
    [t("events.confirmationSpeed"), formatAlertSpeed(event.details.confirmationSpeedKph, locale)],
    [t("events.lastSpeed"), formatAlertSpeed(event.details.lastSpeedKph, locale)],
    [t("events.peakSpeed"), formatAlertSpeed(event.details.peakSpeedKph, locale)],
  ] : [
    [t("events.window"), formatUnit(locale, event.details.durationThresholdMinutes, "minute")],
    [t("events.distanceThreshold"), formatAlertDistance(event.details.distanceThresholdMeters, locale)],
    [t("events.confirmationDistance"), formatAlertDistance(event.details.confirmationDistanceMeters, locale)],
    [t("events.lastDistance"), formatAlertDistance(event.details.lastDistanceMeters, locale)],
    [t("events.minimumDistance"), formatAlertDistance(event.details.minimumDistanceMeters, locale)],
  ];
  return <article className="event-detail" aria-label={t("events.detail")}>
    <header className="event-detail__header">
      <div><Typography.Text type="secondary">{event.type === "SPEEDING" ? <DashboardOutlined aria-hidden /> : <PauseCircleOutlined aria-hidden />} {alertTypeLabel(event.type, locale)}</Typography.Text><Typography.Title level={4} style={{ margin: "4px 0 8px" }}>{event.vehicle.name}</Typography.Title><Tag color={event.status === "OPEN" ? "blue" : "default"}>{alertStatusLabel(event.status, locale)}</Tag></div>
      <Button type="text" icon={<CloseOutlined />} aria-label={t("events.clearSelection")} onClick={onClose} />
    </header>
    <section><Typography.Title level={5} style={{ margin: "0 0 10px" }}>{t("events.lifecycle")}</Typography.Title><dl className="event-detail__facts">
      <div><dt>{t("events.table.opened")}</dt><dd><time dateTime={event.openedAt}>{formatAlertTimestamp(event.openedAt, locale)}</time></dd></div>
      <div><dt>{t("events.lastObserved")}</dt><dd><time dateTime={event.lastObservedAt}>{formatAlertTimestamp(event.lastObservedAt, locale)}</time></dd></div>
      {event.status === "RESOLVED" && event.resolvedAt && <div><dt>{t("events.table.resolved")}</dt><dd><time dateTime={event.resolvedAt}>{formatAlertTimestamp(event.resolvedAt, locale)}</time></dd></div>}
    </dl><Typography.Text type="secondary">Europe/Kyiv</Typography.Text></section>
    <section><Typography.Title level={5} style={{ margin: "0 0 10px" }}>{t("events.evidence")}</Typography.Title><dl className="event-detail__facts">{metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{event.type === "INACTIVITY" && <Typography.Paragraph type="secondary">{t("events.inactivityHelp")}</Typography.Paragraph>}</section>
    {actions.length > 0 && <section><Typography.Title level={5} style={{ margin: "0 0 10px" }}>{t("events.investigate")}</Typography.Title><div className="event-detail__actions">{actions.map((action) => <Button key={action.key} href={action.href}>{t(`events.action.${action.key}`)}</Button>)}</div>
      {actions.some((a) => a.key === "track") && <Typography.Paragraph type="secondary">{t("events.windowHelp")}</Typography.Paragraph>}
      {actions.some((a) => a.key === "position") && <Typography.Paragraph type="secondary">{t("events.positionHelp")}</Typography.Paragraph>}
    </section>}
  </article>;
}
