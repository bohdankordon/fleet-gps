"use client";

import { AlertOutlined, DashboardOutlined, PauseCircleOutlined } from "@ant-design/icons";
import { eventStatusColor } from "./event-semantic-presentation";
import { Tag } from "antd";
import type { AlertEvent } from "../lib/alert-events/alert-events-contract";
import { alertStatusLabel } from "../lib/alert-events/alert-events-formatters";
import { useI18n } from "../i18n/client";

export function EventTypeIcon({ type }: Readonly<{ type: AlertEvent["type"] }>) {
  return type === "SPEEDING" ? <DashboardOutlined aria-hidden /> : <PauseCircleOutlined aria-hidden />;
}

// Keep lifecycle Tags identical to Vehicle Overview's RecentEventItem.
export function EventStatusTag({ status }: Readonly<{ status: AlertEvent["status"] }>) {
  const { locale } = useI18n();
  return <Tag color={eventStatusColor(status)} style={{ marginInlineEnd: 0 }}>{alertStatusLabel(status, locale)}</Tag>;
}

export function EventsEmpty({ description }: Readonly<{ description: string }>) {
  return <div className="events-empty vehicle-track__map-empty"><AlertOutlined className="vehicle-track__map-empty-icon" aria-hidden /><span className="vehicle-track__map-empty-copy">{description}</span></div>;
}
