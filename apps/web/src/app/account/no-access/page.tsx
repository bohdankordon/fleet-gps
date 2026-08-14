import Link from "next/link";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { getServerI18n } from "@/i18n/server";
export const dynamic = "force-dynamic";
export default async function NoAccessPage() { const [, { t }] = await Promise.all([requireAuthUser(), getServerI18n()]); return <main><section className="empty"><h1>{t("account.noSectionsTitle")}</h1><p>{t("account.noSectionsText")}</p><Link href="/account">{t("account.open")}</Link></section></main>; }
