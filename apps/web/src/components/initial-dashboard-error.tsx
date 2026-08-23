"use client";
import { useI18n } from "../i18n/client";
import { Button, ErrorState, PageHeader } from "./ui";
export function InitialDashboardError() { const { t } = useI18n(); return <div className="dashboard-page"><PageHeader eyebrow={t("dashboard.eyebrow")} title={t("dashboard.title")} description={t("dashboard.description")} /><ErrorState title={t("dashboard.loadError")} action={<Button aria-label={t("dashboard.retryAria")} onClick={() => window.location.reload()}>{t("common.retry")}</Button>}>{t("dashboard.initialErrorText")}</ErrorState></div>; }
