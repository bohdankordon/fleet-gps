"use client";
import { useI18n } from "../i18n/client";
export function InitialEventsError() { const { t } = useI18n(); return <main><header className="hero"><p className="eyebrow">{t("events.eyebrow")}</p><h1>{t("events.title")}</h1><p>{t("events.initialDescription")}</p></header><section className="empty" role="alert"><h2>{t("events.loadError")}</h2><p>{t("dashboard.initialErrorText")}</p><button type="button" onClick={() => window.location.reload()}>{t("common.retry")}</button></section></main>; }
