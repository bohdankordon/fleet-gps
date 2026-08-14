import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { getServerI18n } from "@/i18n/server";
export const dynamic = "force-dynamic";
export default async function AccountPage() { const [user, { t }] = await Promise.all([requireAuthUser(), getServerI18n()]); return <main className="auth-page"><section className="auth-card"><h1>{t("account.title")}</h1><dl><div><dt>{t("account.login")}</dt><dd>{user.login}</dd></div><div><dt>{t("account.role")}</dt><dd>{t(`role.${user.role}`)}</dd></div></dl><div className="account-actions"><Link href="/account/change-password">{t("auth.password.title")}</Link><LogoutButton /></div></section></main>; }
