import Link from "next/link";
import { getServerI18n } from "../i18n/server";
export async function InitialVehicleDetailsError() { const { t } = await getServerI18n(); return <main><section className="empty" role="alert"><h1>{t("vehicle.detailsUnavailableTitle")}</h1><p>{t("vehicle.detailsUnavailableText")}</p><Link href="/">{t("vehicle.backToFleet")}</Link></section></main>; }
