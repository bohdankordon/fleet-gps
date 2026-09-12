import { AccountNoAccess } from "@/components/account-no-access";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { getServerI18n } from "@/i18n/server";
export const dynamic = "force-dynamic";
export default async function NoAccessPage() {
  const [, { locale }] = await Promise.all([requireAuthUser(), getServerI18n()]);
  return <AccountNoAccess locale={locale} />;
}
