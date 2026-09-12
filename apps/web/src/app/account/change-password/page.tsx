import { AccountSecurity } from "@/components/account-security";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { getServerI18n } from "@/i18n/server";
export const dynamic = "force-dynamic";
export default async function ChangePasswordPage() {
  const [user, { locale }] = await Promise.all([requireAuthUser(), getServerI18n()]);
  return <AccountSecurity user={user} locale={locale} />;
}
