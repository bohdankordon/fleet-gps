"use client";
import { CompactPageHeading } from "./compact-page-heading";
import { Alert, Button } from "antd";
import { useI18n } from "../i18n/client";
export function InitialEventsError() {
  const { t } = useI18n();
  return <div className="events-page"><header className="events-heading"><div><CompactPageHeading title={t("events.title")} subtitle={t("events.description")} /></div></header><Alert type="error" showIcon title={t("events.loadError")} action={<Button size="large" type="default" href="/events">{t("common.retry")}</Button>} /></div>;
}
