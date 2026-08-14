"use client";
import { useI18n } from "../i18n/client";
export function InitialFleetMapError() { const { t } = useI18n(); return <main><header className="hero"><p className="eyebrow">{t("map.eyebrow")}</p><h1>{t("map.title")}</h1></header><section className="empty" role="alert"><h2>{t("map.initialLoadError")}</h2><p>{t("dashboard.initialErrorText")}</p><button type="button" onClick={() => window.location.reload()}>{t("common.retry")}</button></section></main>; }
