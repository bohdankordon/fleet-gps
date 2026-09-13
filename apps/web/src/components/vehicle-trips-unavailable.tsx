"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "antd";
import { InfoCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import { StableLoadingButton } from "./stable-loading-button";
import { useI18n } from "../i18n/client";

export function VehicleTripsUnavailable() {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  return (
    <section className="vehicle-trips__unavailable" aria-labelledby="vehicle-trips-unavailable-title">
      <Alert
        className="vehicle-trips__unavailable-alert"
        type="info"
        showIcon
        icon={<InfoCircleOutlined aria-hidden />}
        title={
          <h2 id="vehicle-trips-unavailable-title" className="vehicle-trips__unavailable-title">
            {t("trips.contextUnavailable.title")}
          </h2>
        }
        description={t("trips.contextUnavailable.body")}
        action={
          <StableLoadingButton
            idleLabel={t("common.retry")}
            loadingLabel={t("common.refreshing")}
            loading={pending}
            icon={<ReloadOutlined aria-hidden />}
            onClick={() => startTransition(() => router.refresh())}
            size="large"
          />
        }
      />
    </section>
  );
}
