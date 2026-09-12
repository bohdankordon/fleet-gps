import { AccountOverview } from "@/components/account-overview";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { getServerI18n } from "@/i18n/server";
import { loadAccountNotificationSummary } from "@/lib/account/account-notification-summary-server";
export const dynamic = "force-dynamic";
export default async function AccountPage() {
  const user = await requireAuthUser();
  const [{ locale }, summaryState] = await Promise.all([getServerI18n(), loadAccountNotificationSummary()]);
  return <AccountOverview user={user} summaryState={summaryState} locale={locale} />;
}
