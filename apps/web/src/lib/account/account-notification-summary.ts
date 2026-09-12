export const ACCOUNT_TELEGRAM_STATUSES = Object.freeze(["NOT_CONNECTED", "LINK_PENDING", "CONNECTED", "BROKEN"] as const);
export type AccountTelegramStatus = (typeof ACCOUNT_TELEGRAM_STATUSES)[number];

export type AccountNotificationSummary = Readonly<{
  telegramStatus: AccountTelegramStatus;
  preferences: Readonly<{
    enabled: boolean;
    speedingEnabled: boolean;
    inactivityEnabled: boolean;
    vehicleScope: "ALL" | "SELECTED";
    selectedVehicleCount: number;
    canSelectVehicles: boolean;
  }>;
}>;

export type AccountNotificationSummaryState =
  | Readonly<{ availability: "available"; summary: AccountNotificationSummary }>
  | Readonly<{ availability: "unavailable" }>;

export function parseAccountNotificationSummary(value: unknown): AccountNotificationSummary | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (!ACCOUNT_TELEGRAM_STATUSES.includes(candidate.status as AccountTelegramStatus)) return null;
  if (typeof candidate.preferences !== "object" || candidate.preferences === null) return null;
  const preferences = candidate.preferences as Record<string, unknown>;
  if (
    typeof preferences.enabled !== "boolean"
    || typeof preferences.speedingEnabled !== "boolean"
    || typeof preferences.inactivityEnabled !== "boolean"
    || (preferences.vehicleScope !== "ALL" && preferences.vehicleScope !== "SELECTED")
    || !Array.isArray(preferences.selectedVehicleIds)
    || preferences.selectedVehicleIds.some((id) => typeof id !== "string")
    || typeof preferences.canSelectVehicles !== "boolean"
    || !Number.isInteger(preferences.revision)
    || (preferences.revision as number) < 0
  ) return null;

  return Object.freeze({
    telegramStatus: candidate.status as AccountTelegramStatus,
    preferences: Object.freeze({
      enabled: preferences.enabled,
      speedingEnabled: preferences.speedingEnabled,
      inactivityEnabled: preferences.inactivityEnabled,
      vehicleScope: preferences.vehicleScope,
      selectedVehicleCount: preferences.selectedVehicleIds.length,
      canSelectVehicles: preferences.canSelectVehicles,
    }),
  });
}

export async function readAccountNotificationSummary(fetchSummary: () => Promise<Response>): Promise<AccountNotificationSummaryState> {
  try {
    const response = await fetchSummary();
    if (!response.ok) return Object.freeze({ availability: "unavailable" });
    const summary = parseAccountNotificationSummary(await response.json());
    return summary
      ? Object.freeze({ availability: "available", summary })
      : Object.freeze({ availability: "unavailable" });
  } catch {
    return Object.freeze({ availability: "unavailable" });
  }
}
