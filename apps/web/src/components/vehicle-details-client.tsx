"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { AimOutlined, AlertOutlined, BarChartOutlined, HistoryOutlined, NodeIndexOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Card, Col, Divider, Empty, Flex, Listy, Row, Tag, Typography, theme } from "antd";
import type { CardProps } from "antd";
import type { VehicleDetailsEvent, VehicleDetailsResponse } from "@/lib/vehicle-details/vehicle-details-contract";
import { parseVehicleDetailsResponse } from "@/lib/vehicle-details/vehicle-details-contract";
import { alertStatusLabel, alertTypeLabel, formatVehicleAge, formatVehicleDistance, formatVehicleDuration, formatVehicleSpeed, formatVehicleTimestamp, freshnessLabel, notificationDeliveryLabel, qualityLabel, sourceLabel } from "@/lib/vehicle-details/vehicle-details-formatters";
import { alertZoneLabel, formatAlertDistance, formatAlertSpeed } from "@/lib/alert-events/alert-events-formatters";
import { beginVehicleDetailsRefresh, failVehicleDetailsRefresh, initialVehicleDetailsRequestState, succeedVehicleDetailsRefresh } from "@/lib/vehicle-details/vehicle-details-request-state";
import { formatNumber } from "@/i18n/formatting";
import { StableLoadingButton } from "@/components/stable-loading-button";
import { VehicleDetailShell } from "@/components/vehicle-detail-shell";
import { eventSemanticPresentation } from "./event-semantic-presentation";
import { useI18n } from "../i18n/client";

const { Text } = Typography;

type MetricRow = Readonly<{ key: string; label: string; value: ReactNode }>;

export function VehicleDetailsClient({ initialData }: Readonly<{ initialData: VehicleDetailsResponse }>) {
  const { t } = useI18n();
  const [state, setState] = useState(() => initialVehicleDetailsRequestState(initialData));
  const stateRef = useRef(state);
  const active = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { stateRef.current = state; }, [state]);
  const refresh = useCallback(async () => {
    if (active.current) return;
    const begun = beginVehicleDetailsRefresh(stateRef.current);
    if (begun === stateRef.current) return;
    stateRef.current = begun;
    active.current = true;
    setState(begun);
    const generation = begun.generation;
    const nextController = new AbortController();
    controller.current = nextController;
    try {
      const response = await fetch(`/api/vehicles/${begun.data.vehicle.id}/details`, { cache: "no-store", signal: nextController.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error();
      const data = parseVehicleDetailsResponse(await response.json());
      if (!nextController.signal.aborted) {
        const next = succeedVehicleDetailsRefresh(stateRef.current, generation, data);
        stateRef.current = next;
        setState(next);
      }
    } catch {
      if (!nextController.signal.aborted) {
        const next = failVehicleDetailsRefresh(stateRef.current, generation);
        stateRef.current = next;
        setState(next);
      }
    } finally {
      if (generation === stateRef.current.generation) active.current = false;
    }
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => { window.clearInterval(timer); controller.current?.abort(); active.current = false; };
  }, [refresh]);

  const { data } = state;
  const refreshAction = <StableLoadingButton idleLabel={t("common.refresh")} loadingLabel={t("common.refreshing")} loading={state.loading} icon={<ReloadOutlined aria-hidden />} onClick={() => void refresh()} size="large" type="primary" />;

  return <VehicleDetailShell vehicleId={data.vehicle.id} vehicleName={data.vehicle.name} activeTab="overview" generatedAt={data.generatedAt} showMapAction actions={refreshAction}>
    {state.refreshError ? <Alert className="vehicle-overview__refresh-error" type="error" showIcon message={t("vehicle.refreshError")} description={t("vehicle.refreshFallback")} /> : null}
    <Row className="vehicle-overview__primary" gutter={[16, 16]} align="stretch">
      <Col xs={24} md={12} xl={8}><CurrentStateCard data={data} /></Col>
      <Col xs={24} md={12} xl={8}><TodayCard data={data} /></Col>
      <Col xs={24} md={24} xl={8}><ActiveEventsCard data={data} /></Col>
    </Row>
    <RecentEventsCard events={data.recentEvents} />
  </VehicleDetailShell>;
}

function SectionTitle({ icon, title }: Readonly<{ icon: React.ReactNode; title: string }>) {
  const { token } = theme.useToken();
  return <Flex className="vehicle-overview__section-title" align="center" gap="small"><span className="vehicle-overview__section-icon" aria-hidden style={{ color: token.colorPrimary }}>{icon}</span><span>{title}</span></Flex>;
}

function OverviewCard({ className, icon, title, extra, separated = false, children }: Readonly<{ className: string; icon: ReactNode; title: string; extra?: ReactNode; separated?: boolean; children: ReactNode }>) {
  const { token } = theme.useToken();
  const styles: CardProps["styles"] = {
    root: { borderColor: token.colorBorder, borderRadius: token.borderRadiusLG, background: token.colorBgContainer, boxShadow: "none", display: "flex", flexDirection: "column", marginBlockStart: separated ? token.marginLG : 0 },
    header: { minHeight: token.controlHeightLG, paddingBlock: token.paddingSM, paddingInline: token.paddingLG },
    title: { padding: 0 },
    extra: { padding: 0 },
    body: { display: "flex", flex: 1, flexDirection: "column", padding: token.paddingLG },
  };
  return <Card className={`vehicle-overview__surface ${className}`} variant="outlined" title={<SectionTitle icon={icon} title={title} />} extra={extra} styles={styles}>{children}</Card>;
}

function MetricRows({ className = "", items }: Readonly<{ className?: string; items: readonly MetricRow[] }>) {
  return <div className={`vehicle-overview__metric-rows ${className}`.trim()}>{items.map((item) =>
    <div className="vehicle-overview__metric-row" key={item.key}>
      <span className="vehicle-overview__metric-label">{item.label}</span>
      <span className="vehicle-overview__metric-value">{item.value}</span>
    </div>
  )}</div>;
}

function OverviewEmptyState({ message, description }: Readonly<{ message: string; description?: string }>) {
  const { token } = theme.useToken();
  return <Empty
    className="vehicle-overview__empty"
    image={Empty.PRESENTED_IMAGE_SIMPLE}
    styles={{ image: { height: token.controlHeightLG, marginBlockEnd: token.marginXS }, description: { margin: 0 } }}
    description={<Flex vertical align="center" gap={2}><Text>{message}</Text>{description ? <Text type="secondary">{description}</Text> : null}</Flex>}
  />;
}

function CurrentStateCard({ data }: Readonly<{ data: VehicleDetailsResponse }>) {
  const { locale, t } = useI18n();
  const current = data.currentState;
  const connectivityColor = data.connectivity === "ONLINE" ? "green" : data.connectivity === "OFFLINE" ? "red" : "default";
  const connectivity: MetricRow = { key: "connectivity", label: `${t("vehicle.connectivity")}:`, value: <Tag color={connectivityColor} style={{ marginInlineEnd: 0 }}>{t(`vehicle.connectivity.${data.connectivity}`)}</Tag> };
  const populatedItems: readonly MetricRow[] = current ? [connectivity,
    { key: "freshness", label: `${t("vehicle.positionStatus")}:`, value: <Tag color={current.freshness === "FRESH" ? "green" : "orange"} style={{ marginInlineEnd: 0 }}>{freshnessLabel(current.freshness, locale)}</Tag> },
    { key: "speed", label: `${t("vehicle.speed")}:`, value: formatVehicleSpeed(current.speedKph, locale) },
    { key: "positionTime", label: `${t("vehicle.positionTime")}:`, value: <time dateTime={current.position.observedAt}>{formatVehicleTimestamp(current.position.observedAt, locale)}</time> },
    { key: "positionAge", label: `${t("vehicle.positionAge")}:`, value: formatVehicleAge(current.position.observedAt, data.generatedAt, locale) },
  ] : [];
  return <OverviewCard className="vehicle-overview__card" icon={<AimOutlined />} title={t("vehicle.currentState")} extra={data.vehicle.disabled ? <Tag>{t("vehicle.disabled")}</Tag> : undefined}>
    {current === null ? <>
      <div className="vehicle-overview__compact-pair"><span>{connectivity.label}</span>{connectivity.value}</div>
      <OverviewEmptyState message={t("vehicle.positionUnavailable")} />
    </> : <MetricRows className="vehicle-overview__primary-rows" items={populatedItems} />}
  </OverviewCard>;
}

function TodayCard({ data }: Readonly<{ data: VehicleDetailsResponse }>) {
  const { locale, t } = useI18n();
  const { token } = theme.useToken();
  const sectionDividerGap = token.marginSM;
  const today = data.today;
  if (today === null) return <OverviewCard className="vehicle-overview__card" icon={<BarChartOutlined />} title={t("vehicle.today")}>
    <OverviewEmptyState message={t("vehicle.todayUnavailable")} description={t("vehicle.todayUnavailableHelp")} />
  </OverviewCard>;
  const items: readonly MetricRow[] = [
    { key: "movement", label: `${t("vehicle.movementTime")}:`, value: formatVehicleDuration(today.movementDurationSeconds, locale) },
    { key: "maximum", label: `${t("vehicle.maxSpeed")}:`, value: formatVehicleSpeed(today.maxSpeedKph, locale) },
    { key: "quality", label: `${t("vehicle.quality")}:`, value: <Tag style={{ marginInlineEnd: 0 }}>{qualityLabel(today.quality, locale)}</Tag> },
    { key: "source", label: `${t("vehicle.source")}:`, value: sourceLabel(today.source, locale) },
  ];
  return <OverviewCard className="vehicle-overview__card" icon={<BarChartOutlined />} title={t("vehicle.today")}>
    <div className="vehicle-overview__primary-metric">
      <NodeIndexOutlined className="vehicle-overview__primary-metric-icon" aria-hidden style={{ color: token.colorTextSecondary }} />
      <Text className="vehicle-overview__primary-label">{t("vehicle.todayDistance")}:</Text>
      <Text className="vehicle-overview__primary-value" strong>{formatVehicleDistance(today.distanceMeters, locale)}</Text>
    </div>
    <Divider className="vehicle-overview__metric-divider" style={{ marginBlock: sectionDividerGap }} />
    <MetricRows className="vehicle-overview__primary-rows" items={items} />
    {today.isStale || today.isDegraded ? <Flex className="vehicle-overview__supporting-tags" gap="small" wrap="wrap">
      {today.isStale ? <Tag color="orange">{t("vehicle.statsStale")}</Tag> : null}
      {today.isDegraded ? <Tag color="gold">{t("vehicle.statsDegraded")}</Tag> : null}
    </Flex> : null}
  </OverviewCard>;
}

function ActiveEventsCard({ data }: Readonly<{ data: VehicleDetailsResponse }>) {
  const { locale, t } = useI18n();
  const { token } = theme.useToken();
  return <OverviewCard className="vehicle-overview__card" icon={<AlertOutlined />} title={t("vehicle.activeEvents")}>
    {data.activeAlerts.length === 0 ? <OverviewEmptyState message={t("vehicle.noActiveEvents")} /> : <Listy className="vehicle-overview__active-list" items={[...data.activeAlerts]} rowKey={(alert) => alert.type} styles={{ item: { borderBlockEnd: 0 } }} itemRender={(alert, index) =>
      <div className="vehicle-overview__active-record">
        <Flex className="vehicle-overview__active-item" vertical gap={4}>
          <Tag color={alert.type === "SPEEDING" ? "red" : "gold"}>{alertTypeLabel(alert.type, locale)}</Tag>
          <Text type="secondary">{t("vehicle.eventOpened")}: <time dateTime={alert.openedAt}>{formatVehicleTimestamp(alert.openedAt, locale)}</time></Text>
        </Flex>
        {index < data.activeAlerts.length - 1 ? <Divider className="vehicle-overview__active-separator" style={{ marginBlock: token.marginXS }} /> : null}
      </div>
    } />}
  </OverviewCard>;
}

function RecentEventsCard({ events }: Readonly<{ events: VehicleDetailsResponse["recentEvents"] }>) {
  const { t } = useI18n();
  return <OverviewCard className="vehicle-overview__recent" icon={<HistoryOutlined />} title={t("vehicle.recentEvents")} separated>
    {events.length === 0 ? <OverviewEmptyState message={t("vehicle.noRecentEvents")} /> : <Listy className="vehicle-overview__recent-list" items={[...events]} rowKey="id" styles={{ item: { borderBlockEnd: 0, padding: 0, backgroundColor: "transparent" } }} itemRender={(event, index) => <RecentEventItem event={event} showDivider={index < events.length - 1} />} />}
  </OverviewCard>;
}

function RecentEventItem({ event, showDivider }: Readonly<{ event: VehicleDetailsEvent; showDivider: boolean }>) {
  const { locale, t } = useI18n();
  const { token } = theme.useToken();
  const sectionDividerGap = token.marginSM;
  const { accent: semanticAccent, marker, statusColor } = eventSemanticPresentation(event, token);
  const sectionStyle = {
    "--vehicle-event-section-bg": token.colorFillQuaternary,
    "--vehicle-event-section-accent": semanticAccent,
    "--vehicle-event-section-radius": `${token.borderRadiusLG}px`,
    "--vehicle-event-section-padding": `${token.paddingSM}px`,
    "--vehicle-event-section-gap": `${token.marginSM}px`,
    "--vehicle-event-connector-bottom": `-${token.marginSM + token.paddingSM + 2}px`,
  } as CSSProperties;
  const deliveryColor = event.notificationDeliveryStatus === "SENT" ? "green" : event.notificationDeliveryStatus === "FAILED" ? "red" : event.notificationDeliveryStatus === "PENDING" ? "gold" : "default";
  const lifecycleItems: readonly MetricRow[] = [
    { key: "opened", label: `${t("vehicle.eventOpened")}:`, value: <time dateTime={event.openedAt}>{formatVehicleTimestamp(event.openedAt, locale)}</time> },
    { key: "resolved", label: `${t("vehicle.eventResolved")}:`, value: event.resolvedAt ? <time dateTime={event.resolvedAt}>{formatVehicleTimestamp(event.resolvedAt, locale)}</time> : <Text type="secondary">—</Text> },
    { key: "delivery", label: `${t("vehicle.eventDelivery")}:`, value: <Tag color={deliveryColor} style={{ marginInlineEnd: 0 }}>{notificationDeliveryLabel(event.notificationDeliveryStatus, locale)}</Tag> },
  ];
  const detailItems: readonly MetricRow[] = event.type === "SPEEDING" ? [
    { key: "zone", label: `${t("vehicle.eventZone")}:`, value: alertZoneLabel(event.details.zone, locale) },
    { key: "confirmation", label: `${t("vehicle.eventConfirmationSpeed")}:`, value: formatAlertSpeed(event.details.confirmationSpeedKph, locale) },
    { key: "last", label: `${t("vehicle.eventLastSpeed")}:`, value: formatAlertSpeed(event.details.lastSpeedKph, locale) },
    { key: "peak", label: `${t("vehicle.eventPeakSpeed")}:`, value: formatAlertSpeed(event.details.peakSpeedKph, locale) },
    { key: "threshold", label: `${t("vehicle.eventSpeedThreshold")}:`, value: formatAlertSpeed(event.details.thresholdKph, locale) },
  ] : [
    { key: "confirmation", label: `${t("vehicle.eventConfirmationDistance")}:`, value: formatAlertDistance(event.details.confirmationDistanceMeters, locale) },
    { key: "last", label: `${t("vehicle.eventLastDistance")}:`, value: formatAlertDistance(event.details.lastDistanceMeters, locale) },
    { key: "minimum", label: `${t("vehicle.eventMinimumDistance")}:`, value: formatAlertDistance(event.details.minimumDistanceMeters, locale) },
    { key: "threshold", label: `${t("vehicle.eventDistanceThreshold")}:`, value: formatAlertDistance(event.details.distanceThresholdMeters, locale) },
    { key: "duration", label: `${t("vehicle.eventDurationThreshold")}:`, value: `${formatNumber(locale, event.details.durationThresholdMinutes)} ${t("unit.minuteShort")}` },
  ];
  return <div className={`vehicle-overview__chronology-item${showDivider ? " vehicle-overview__chronology-item--connected" : ""}`} style={sectionStyle}>
    <div className="vehicle-overview__chronology-marker"><span className="vehicle-overview__chronology-icon">{marker}</span>{showDivider ? <span className="vehicle-overview__chronology-line" aria-hidden /> : null}</div>
    <div className="vehicle-overview__recent-content">
      <Flex className="vehicle-overview__event-heading" align="center" gap="small" wrap="wrap">
        <Text strong>{alertTypeLabel(event.type, locale)}</Text>
        <Tag color={statusColor} style={{ marginInlineEnd: 0 }}>{alertStatusLabel(event.status, locale)}</Tag>
      </Flex>
      <MetricRows className="vehicle-overview__event-lifecycle" items={lifecycleItems} />
      <Divider className="vehicle-overview__event-section-divider" style={{ marginBlock: sectionDividerGap }} />
      <MetricRows className="vehicle-overview__event-details" items={detailItems} />
    </div>
  </div>;
}
