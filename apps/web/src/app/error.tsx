"use client";
import { Button } from "antd";
import { AuxiliaryState } from "@/components/auxiliary-state";
import { useI18n } from "@/i18n/client";

export default function RootError({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const { t } = useI18n();
  return (
    <div className="auxiliary-state-page">
      <AuxiliaryState
        title={t("error.title")}
        description={t("error.body")}
        action={<Button type="primary" size="large" onClick={() => reset()}>{t("common.retry")}</Button>}
      />
    </div>
  );
}
