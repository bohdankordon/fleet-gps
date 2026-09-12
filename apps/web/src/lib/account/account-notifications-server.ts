import "server-only";
import { authenticatedApiFetch } from "../auth/auth-cookie";
import { parseWebConfig } from "../web-config";
import { parseTelegramConnectionView, type TelegramConnectionView } from "./account-telegram-connection";
import { parsePreferenceBaseline, type PreferenceBaseline } from "./account-notification-preferences";

export type AccountNotificationsState =
  | Readonly<{ availability: "available"; connection: TelegramConnectionView; baseline: PreferenceBaseline }>
  | Readonly<{ availability: "unavailable" }>;

// Session-only server read: forwards just `taxi_session` via the accepted
// authenticated helper, never the full cookie jar. One GET serves both the
// Telegram prerequisite context and the preferences baseline; anything
// non-OK or malformed is unavailable, never fabricated defaults.
export async function loadAccountNotificationsState(): Promise<AccountNotificationsState> {
  try {
    const config = parseWebConfig(process.env);
    const response = await authenticatedApiFetch(`${config.apiInternalBaseUrl}/api/account/notifications`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return Object.freeze({ availability: "unavailable" });
    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null) return Object.freeze({ availability: "unavailable" });
    const record = value as Record<string, unknown>;
    const connection = parseTelegramConnectionView({ status: record.status, pendingExpiresAt: record.pendingExpiresAt });
    const baseline = parsePreferenceBaseline(record.preferences);
    if (!connection || !baseline) return Object.freeze({ availability: "unavailable" });
    return Object.freeze({ availability: "available", connection, baseline });
  } catch {
    return Object.freeze({ availability: "unavailable" });
  }
}
