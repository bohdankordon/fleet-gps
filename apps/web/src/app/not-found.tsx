import { Button } from "antd";
import { AuxiliaryState } from "@/components/auxiliary-state";
import { getServerI18n } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getServerI18n();
  return (
    <div className="auxiliary-state-page">
      <AuxiliaryState
        title={t("notFound.title")}
        description={t("notFound.body")}
        action={<Button type="default" size="large" href="/">{t("vehicle.backToFleet")}</Button>}
      />
    </div>
  );
}
