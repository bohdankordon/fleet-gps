"use client";

import { Button, Typography, theme } from "antd";
import { CarOutlined, CloseOutlined, EnvironmentOutlined, HistoryOutlined, NodeIndexOutlined } from "@ant-design/icons";
import type { AlertEvent } from "../lib/alert-events/alert-events-contract";
import { alertTypeLabel, alertZoneLabel, formatAlertDistance, formatAlertSpeed, formatAlertTimestamp } from "../lib/alert-events/alert-events-formatters";
import { alertEventActions } from "../lib/alert-events/alert-events-investigation";
import { formatUnit } from "../i18n/formatting";
import { useI18n } from "../i18n/client";
import { useAuth } from "./auth-provider";
import { VehicleGroupTag } from "./vehicle-detail-shell";
import { eventSemanticPresentation } from "./event-semantic-presentation";
import { EventStatusTag } from "./events-presentation";

export function EventDetail({ event, onClose, now }: Readonly<{ event: AlertEvent; onClose: () => void; now: Date }>) {
  const { locale, t } = useI18n(); const { token } = theme.useToken(); const user = useAuth();
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
  return <article className="event-detail" aria-label={t("events.detail")} style={{ fontFamily: token.fontFamily, fontSize: token.fontSize, color: token.colorText }}>
    <header className="event-detail__header">
      <div><Typography.Text className="event-detail__type" type="secondary"><span className="vehicle-overview__section-icon">{eventSemanticPresentation(event, token).marker}</span> {alertTypeLabel(event.type, locale)}</Typography.Text><Typography.Title level={4} style={{ margin: "4px 0 8px" }}><span className="vehicle-group-identity"><span className="vehicle-group-identity__name">{event.vehicle.name}</span><VehicleGroupTag group={event.vehicle.group} /></span></Typography.Title><EventStatusTag status={event.status} /></div>
      <Button className="vehicle-track__observation-close" type="text" icon={<CloseOutlined />} aria-label={t("events.clearSelection")} onClick={onClose} />
    </header>
    <section><Typography.Title className="event-detail__section-title vehicle-overview__section-title" level={5} style={{ margin: 0, fontSize: token.fontSizeLG }}>{t("events.lifecycle")}</Typography.Title><dl className="event-detail__facts vehicle-overview__metric-rows vehicle-overview__event-lifecycle">
      <div className="vehicle-overview__metric-row"><dt>{t("events.table.opened")}</dt><dd><time dateTime={event.openedAt}>{formatAlertTimestamp(event.openedAt, locale)}</time></dd></div>
      <div className="vehicle-overview__metric-row"><dt>{t("events.lastObserved")}</dt><dd><time dateTime={event.lastObservedAt}>{formatAlertTimestamp(event.lastObservedAt, locale)}</time></dd></div>
      {event.status === "RESOLVED" && event.resolvedAt && <div className="vehicle-overview__metric-row"><dt>{t("events.table.resolved")}</dt><dd><time dateTime={event.resolvedAt}>{formatAlertTimestamp(event.resolvedAt, locale)}</time></dd></div>}
    </dl><Typography.Text className="event-detail__help" type="secondary">Europe/Kyiv</Typography.Text></section>
    <section><Typography.Title className="event-detail__section-title vehicle-overview__section-title" level={5} style={{ margin: 0, fontSize: token.fontSizeLG }}>{t("events.evidence")}</Typography.Title><dl className="event-detail__facts vehicle-overview__metric-rows vehicle-overview__event-lifecycle">{metrics.map(([label, value]) => <div className="vehicle-overview__metric-row" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{event.type === "INACTIVITY" && <Typography.Paragraph className="event-detail__help" type="secondary">{t("events.inactivityHelp")}</Typography.Paragraph>}</section>
    {actions.length > 0 && <section><Typography.Title className="event-detail__section-title vehicle-overview__section-title" level={5} style={{ margin: 0, fontSize: token.fontSizeLG }}>{t("events.investigate")}</Typography.Title><div className="event-detail__actions">{actions.map((action) => <Button size="large" type="default" key={action.key} href={action.href} icon={action.key === "vehicle" ? <CarOutlined aria-hidden /> : action.key === "track" ? <HistoryOutlined aria-hidden /> : action.key === "trips" ? <NodeIndexOutlined aria-hidden /> : <EnvironmentOutlined aria-hidden />}>{t(`events.action.${action.key}`)}</Button>)}</div>
      {actions.some((a) => a.key === "track") && <Typography.Paragraph className="event-detail__help" type="secondary">{t("events.windowHelp")}</Typography.Paragraph>}
      {actions.some((a) => a.key === "position") && <Typography.Paragraph className="event-detail__help" type="secondary">{t("events.positionHelp")}</Typography.Paragraph>}
    </section>}
  </article>;
}
