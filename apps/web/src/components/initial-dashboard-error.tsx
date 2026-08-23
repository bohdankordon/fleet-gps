"use client";
import { useI18n } from "../i18n/client";
export function InitialDashboardError() { const { t } = useI18n(); return <div><header className="hero"><p className="eyebrow">{t("dashboard.eyebrow")}</p><h1>{t("dashboard.title")}</h1><p>{t("dashboard.description")}</p></header><section className="empty" role="alert"><h2>{t("dashboard.loadError")}</h2><p>{t("dashboard.initialErrorText")}</p><button type="button" aria-label={t("dashboard.retryAria")} onClick={() => window.location.reload()}>{t("common.retry")}</button></section></div>; }
