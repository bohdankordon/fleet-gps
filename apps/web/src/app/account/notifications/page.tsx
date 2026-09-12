import { AccountNotifications } from "@/components/account-notifications";
import { hasPermission, requireAuthUser } from "@/lib/auth/auth-user";
import { getServerI18n } from "@/i18n/server";
export const dynamic = "force-dynamic";
export default async function NotificationsPage() {
  const [user, { locale }] = await Promise.all([requireAuthUser(), getServerI18n()]);
  // Delivery needs ADMIN authority or both product permissions; anything
  // less stays editable but is flagged as undeliverable. Mirrors the
  // backend planner/dispatcher rule without moving access control here.
  const deliveryLimited = !(hasPermission(user, "events.view") && hasPermission(user, "vehicles.view"));
  return <AccountNotifications locale={locale} deliveryLimited={deliveryLimited} />;
}
