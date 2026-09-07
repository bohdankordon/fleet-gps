"use client";
import { Button, Empty, Flex, Typography } from "antd";
import { CompactPageHeading } from "./compact-page-heading";
import { useI18n } from "../i18n/client";
const { Text } = Typography;
export function InitialFleetMapError() { const { t } = useI18n(); return <div className="map-page"><header className="map-page__header"><CompactPageHeading title={t("map.title")} subtitle={t("map.description")} /></header><section role="alert"><Empty description={t("map.initialLoadError")}><Flex vertical gap="middle" align="center"><Text type="secondary">{t("dashboard.initialErrorText")}</Text><Button type="primary" onClick={() => window.location.reload()}>{t("common.retry")}</Button></Flex></Empty></section></div>; }
