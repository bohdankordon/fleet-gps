import "server-only";
import { authenticatedApiFetch } from "../auth/auth-cookie";
import { parseWebConfig } from "../web-config";
import { parseAccountNotificationSummary } from "./account-notification-summary";
import { parseTelegramConnectionView, type TelegramConnectionView } from "./account-telegram-connection";

export type AccountTelegramState =
  | Readonly<{ availability: "available"; connection: TelegramConnectionView; notificationsEnabled: boolean | null }>
  | Readonly<{ availability: "unavailable" }>;

// Session-only server read: forwards just `taxi_session` via the accepted
// authenticated helper, never the full cookie jar. Preferences survive only
// as the enabled flag for one contextual line; the editor stays Screen 4.
export async function loadAccountTelegramState(): Promise<AccountTelegramState> {
  try {
    const config = parseWebConfig(process.env);
    const response = await authenticatedApiFetch(`${config.apiInternalBaseUrl}/api/account/notifications`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return Object.freeze({ availability: "unavailable" });
    const value: unknown = await response.json();
    const connection = parseTelegramConnectionView(value);
    if (!connection) return Object.freeze({ availability: "unavailable" });
    const summary = parseAccountNotificationSummary(value);
    return Object.freeze({ availability: "available", connection, notificationsEnabled: summary ? summary.preferences.enabled : null });
  } catch {
    return Object.freeze({ availability: "unavailable" });
  }
}
