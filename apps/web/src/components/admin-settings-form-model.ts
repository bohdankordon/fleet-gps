import type { AdminSettings } from "@/lib/admin-settings/admin-settings-contract";

export type EditableAdminSettings = Omit<AdminSettings, "cityGeofence" | "updatedAt" | "revision">;
export const numericAdminSettingsBounds = Object.freeze({ minimumDailyDistanceMeters: [0], positionFreshnessSeconds: [1], citySpeedLimitKph: [1, 200], outsideCitySpeedLimitKph: [1, 200], speedToleranceKph: [0, 50], speedingConfirmationUpdates: [1, 10], inactivityDistanceMeters: [0, 5000], inactivityDurationMinutes: [1, 1440] } as const);

export function adminSettingsDraft(settings: AdminSettings): EditableAdminSettings {
  const { cityGeofence: _geofence, updatedAt: _updatedAt, revision: _revision, ...value } = settings;
  return value;
}

export function adminSettingsDirty(current: EditableAdminSettings, persisted: AdminSettings): boolean {
  return JSON.stringify(current) !== JSON.stringify(adminSettingsDraft(persisted));
}

export function validateAdminSettingsDraft(value: EditableAdminSettings): string | null {
  try { new Intl.DateTimeFormat("en-CA", { timeZone: value.timezone }).format(new Date(0)); } catch { return "timezone"; }
  for (const [key, [min, max]] of Object.entries(numericAdminSettingsBounds) as [keyof typeof numericAdminSettingsBounds, readonly [number, number?]][]) {
    const candidate = value[key];
    if (!Number.isSafeInteger(candidate) || candidate < min || max !== undefined && candidate > max) return key;
  }
  return null;
}

export function adminSettingsPatchPayload(value: EditableAdminSettings, revision: number): Readonly<{ revision: number } & EditableAdminSettings> {
  return { revision, ...value };
}
