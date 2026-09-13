"use client";

import { Button } from "antd";
import { useI18n } from "@/i18n/client";
import { AuxiliaryState } from "./auxiliary-state";

export function ForbiddenState() {
  const { t } = useI18n();
  return <div className="auxiliary-state-page">
    <AuxiliaryState
      title={t("account.forbiddenTitle")}
      description={t("account.forbiddenText")}
      action={<Button type="default" size="large" href="/account">{t("account.open")}</Button>}
    />
  </div>;
}
