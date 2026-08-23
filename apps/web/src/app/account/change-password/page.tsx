import { ChangePasswordForm } from "@/components/change-password-form";
import { LogoutButton } from "@/components/logout-button";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { getServerI18n } from "@/i18n/server";
export const dynamic = "force-dynamic";
export default async function ChangePasswordPage() { const [user, { t }] = await Promise.all([requireAuthUser(), getServerI18n()]); return <div className="auth-page"><section className="auth-card"><h1>{t("auth.password.title")}</h1>{user.mustChangePassword && <p>{t("auth.password.mustChange")}</p>}<ChangePasswordForm /><div className="account-actions"><LogoutButton /></div></section></div>; }
