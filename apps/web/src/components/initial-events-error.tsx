"use client";

import { useI18n } from "../i18n/client";
import { Button, ErrorState, PageHeader } from "./ui";

export function InitialEventsError() {
  const { t } = useI18n();
  return <div className="events-page">
    <PageHeader className="events-page-header" eyebrow={t("events.eyebrow")} title={t("events.title")} description={t("events.initialDescription")} />
    <ErrorState title={t("events.loadError")} action={<Button onClick={() => window.location.reload()}>{t("common.retry")}</Button>}>{t("dashboard.initialErrorText")}</ErrorState>
  </div>;
}
