"use client";
import { Alert, Button, Typography } from "antd";
import { useI18n } from "../i18n/client";
export function InitialEventsError() {
  const { t } = useI18n();
  return <div className="events-page"><Typography.Title level={2}>{t("events.title")}</Typography.Title><Typography.Text type="secondary">{t("events.description")}</Typography.Text><Alert type="error" showIcon title={t("events.loadError")} action={<Button href="/events">{t("common.retry")}</Button>} /></div>;
}
