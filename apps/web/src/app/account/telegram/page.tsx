import { AccountTelegram } from "@/components/account-telegram";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { getServerI18n } from "@/i18n/server";
import { loadAccountTelegramState } from "@/lib/account/account-telegram-server";
export const dynamic = "force-dynamic";
export default async function AccountTelegramPage() {
  const [, { locale }, state] = await Promise.all([requireAuthUser(), getServerI18n(), loadAccountTelegramState()]);
  return <AccountTelegram initial={state} locale={locale} />;
}
