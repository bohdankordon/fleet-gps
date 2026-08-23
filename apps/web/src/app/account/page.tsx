import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { getServerI18n } from "@/i18n/server";
import { UserIcon } from "@/components/ui/icons";
export const dynamic = "force-dynamic";
export default async function AccountPage() { const [user, { t }] = await Promise.all([requireAuthUser(), getServerI18n()]); return <div className="auth-page"><section className="auth-card account-card"><header className="account-heading"><span className="account-icon"><UserIcon size={24} /></span><div><p className="eyebrow">{t("account.title")}</p><h1>{user.login}</h1></div></header><dl className="account-details"><div><dt>{t("account.login")}</dt><dd>{user.login}</dd></div><div><dt>{t("account.role")}</dt><dd>{t(`role.${user.role}`)}</dd></div></dl><div className="account-actions"><Link className="account-password-link" href="/account/change-password">{t("auth.password.title")}</Link><LogoutButton /></div></section></div>; }
