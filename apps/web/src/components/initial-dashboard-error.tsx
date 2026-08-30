"use client";

import { Button, Result } from "antd";
import { useI18n } from "../i18n/client";

export function InitialDashboardError() { const { t } = useI18n(); return <Result status="error" title={t("dashboard.loadError")} subTitle={t("dashboard.initialErrorText")} extra={<Button type="primary" onClick={() => window.location.reload()}>{t("common.retry")}</Button>} />; }
