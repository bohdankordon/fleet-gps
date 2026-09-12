import "server-only";
import { authenticatedApiFetch } from "../auth/auth-cookie";
import { parseWebConfig } from "../web-config";
import { readAccountNotificationSummary } from "./account-notification-summary";

export function loadAccountNotificationSummary() {
  const config = parseWebConfig(process.env);
  return readAccountNotificationSummary(() => authenticatedApiFetch(`${config.apiInternalBaseUrl}/api/account/notifications`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  }));
}
