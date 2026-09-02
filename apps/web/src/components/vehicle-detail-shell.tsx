"use client";

import type { ReactNode } from "react";
import { CarOutlined, EnvironmentOutlined } from "@ant-design/icons";
import { Button, Flex, Tabs, Typography, theme } from "antd";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { hasPermission } from "@/lib/auth/auth-contract";
import { formatVehicleTimestamp } from "@/lib/vehicle-details/vehicle-details-formatters";
import { fleetMapVehicleHref } from "@/lib/fleet-map/fleet-map-deep-link";
import { useI18n } from "../i18n/client";

const { Text, Title } = Typography;

export type VehicleDetailTab = "overview" | "trips" | "history";

type Props = Readonly<{
  vehicleId: string;
  vehicleName: string;
  activeTab: VehicleDetailTab;
  generatedAt?: string | null;
  description?: string;
  showMapAction?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}>;

export function vehicleDetailRoute(vehicleId: string, tab: VehicleDetailTab): string {
  if (tab === "trips") return `/vehicles/${vehicleId}/trips`;
  if (tab === "history") return `/vehicles/${vehicleId}/track`;
  return `/vehicles/${vehicleId}`;
}

export function visibleVehicleDetailTabs(canViewTrips: boolean): readonly VehicleDetailTab[] {
  return canViewTrips ? ["overview", "trips", "history"] : ["overview"];
}

export function VehicleDetailShell({ vehicleId, vehicleName, activeTab, generatedAt = null, description, showMapAction = false, actions, children }: Props) {
  const router = useRouter();
  const auth = useAuth();
  const { locale, t } = useI18n();
  const { token } = theme.useToken();
  const canViewTrips = auth !== null && hasPermission(auth, "trips.view");
  const canOpenMap = auth !== null && hasPermission(auth, "map.view");
  const labels: Record<VehicleDetailTab, string> = { overview: t("vehicle.overview"), trips: t("vehicle.trips"), history: t("vehicle.history") };
  const tabs = visibleVehicleDetailTabs(canViewTrips).map((tab) => ({ key: tab, label: labels[tab] }));

  return <div className="vehicle-detail-shell">
    <header className="vehicle-detail-shell__header">
      <Text className="vehicle-detail-shell__eyebrow">{t("vehicle.eyebrow")}</Text>
      <Flex className="vehicle-detail-shell__heading" align="flex-start" justify="space-between" gap="large" wrap="wrap">
        <Flex className="vehicle-detail-shell__identity" align="center" gap="middle">
          <CarOutlined className="vehicle-detail-shell__vehicle-icon" aria-hidden style={{ color: token.colorTextTertiary }} />
          <Title level={1}>{vehicleName}</Title>
        </Flex>
        {showMapAction || actions ? <Flex className="vehicle-detail-shell__actions" align="center" gap="small" wrap="wrap">
          {showMapAction && canOpenMap ? <Button type="default" size="large" href={fleetMapVehicleHref(vehicleId)} icon={<EnvironmentOutlined aria-hidden />}>{t("vehicle.openMap")}</Button> : null}
          {actions}
        </Flex> : null}
      </Flex>
      {description ? <Text className="vehicle-detail-shell__description" type="secondary">{description}</Text> : null}
      {generatedAt ? <Text className="vehicle-detail-shell__metadata" type="secondary">{t("vehicle.generated")}: <Text strong><time dateTime={generatedAt}>{formatVehicleTimestamp(generatedAt, locale)}</time></Text></Text> : null}
    </header>
    <Tabs
      className="vehicle-detail-shell__tabs"
      activeKey={activeTab}
      animated={false}
      items={tabs}
      onChange={(tab) => router.push(vehicleDetailRoute(vehicleId, tab as VehicleDetailTab))}
      styles={{ body: { display: "none" } }}
    />
    <div className="vehicle-detail-shell__body">{children}</div>
  </div>;
}
