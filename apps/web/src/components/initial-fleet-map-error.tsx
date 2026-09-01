"use client";
import { Button, Empty, Flex, Typography } from "antd";
import { useI18n } from "../i18n/client";
const { Text, Title } = Typography;
export function InitialFleetMapError() { const { t } = useI18n(); return <div className="map-page"><header className="map-page__header"><Title level={1} style={{ margin: 0 }}>{t("map.title")}</Title><Text type="secondary">{t("map.description")}</Text></header><section role="alert"><Empty description={t("map.initialLoadError")}><Flex vertical gap="middle" align="center"><Text type="secondary">{t("dashboard.initialErrorText")}</Text><Button type="primary" onClick={() => window.location.reload()}>{t("common.retry")}</Button></Flex></Empty></section></div>; }
