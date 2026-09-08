import type { AdminSettings } from "@/lib/admin-settings/admin-settings-contract";

// Frontend/backend validation parity (Phase 0 correctness).
// Backend is authoritative:
// - minimumDailyDistanceMeters: integer 0..10_000_000
// - positionFreshnessSeconds: integer 1..86_400
// - citySpeedLimitKph / outsideCitySpeedLimitKph / tripMovementSpeedKph: 1..200
// - speedToleranceKph: 0..50, speedingConfirmationUpdates: 1..10
// - inactivityDistanceMeters: 0..5_000, inactivityDurationMinutes: 1..1_440
// - tripMovementConfirmationSeconds / tripStopConfirmationSeconds / tripDataGapSeconds: 1..604_800
// Do not relax backend validation; do not change business defaults.
export type EditableAdminSettings = Omit<AdminSettings, "cityGeofence" | "updatedAt" | "revision" | "minimumDailyDistanceMeters" | "positionFreshnessSeconds" | "citySpeedLimitKph" | "outsideCitySpeedLimitKph" | "speedToleranceKph" | "speedingConfirmationUpdates" | "inactivityDistanceMeters" | "inactivityDurationMinutes" | "tripMovementSpeedKph" | "tripMovementConfirmationSeconds" | "tripStopConfirmationSeconds" | "tripDataGapSeconds"> & Readonly<{
  minimumDailyDistanceMeters: number | "";
  positionFreshnessSeconds: number | "";
  citySpeedLimitKph: number | "";
  outsideCitySpeedLimitKph: number | "";
  speedToleranceKph: number | "";
  speedingConfirmationUpdates: number | "";
  inactivityDistanceMeters: number | "";
  inactivityDurationMinutes: number | "";
  tripMovementSpeedKph: number | "";
  tripMovementConfirmationSeconds: number | "";
  tripStopConfirmationSeconds: number | "";
  tripDataGapSeconds: number | "";
}>;
export const numericAdminSettingsBounds = Object.freeze({ minimumDailyDistanceMeters: [0, 10_000_000], positionFreshnessSeconds: [1, 86_400], citySpeedLimitKph: [1, 200], outsideCitySpeedLimitKph: [1, 200], speedToleranceKph: [0, 50], speedingConfirmationUpdates: [1, 10], inactivityDistanceMeters: [0, 5000], inactivityDurationMinutes: [1, 1440], tripMovementSpeedKph: [1, 200], tripMovementConfirmationSeconds: [1, 604800], tripStopConfirmationSeconds: [1, 604800], tripDataGapSeconds: [1, 604800] } as const);

// Human-readable field labels for translated validation (Phase 0 correctness).
// Prevents raw camelCase field names from surfacing to users.
export const adminSettingsFieldLabelKeys = Object.freeze({
  timezone: "admin.settings.timezone",
  minimumDailyDistanceMeters: "admin.settings.minimumDailyDistance",
  positionFreshnessSeconds: "admin.settings.positionFreshness",
  citySpeedLimitKph: "admin.settings.citySpeedLimit",
  outsideCitySpeedLimitKph: "admin.settings.outsideCitySpeedLimit",
  speedToleranceKph: "admin.settings.speedTolerance",
  speedingConfirmationUpdates: "admin.settings.speedConfirmations",
  inactivityDistanceMeters: "admin.settings.inactivityDistance",
  inactivityDurationMinutes: "admin.settings.inactivityDuration",
  tripMovementSpeedKph: "admin.settings.tripMovementSpeed",
  tripMovementConfirmationSeconds: "admin.settings.tripMovementConfirmation",
  tripStopConfirmationSeconds: "admin.settings.tripStopConfirmation",
  tripDataGapSeconds: "admin.settings.tripDataGap",
} as const);
export type AdminSettingsFieldKey = keyof typeof adminSettingsFieldLabelKeys;

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
    // Truthful blank-vs-zero: empty draft ("") must not coerce to 0 via
    // Number("") === 0. Blank is invalid (return key); explicit numeric zero
    // remains accepted where backend allows zero.
    if (candidate === "") return key;
    if (!Number.isSafeInteger(candidate) || candidate < min || max !== undefined && candidate > max) return key;
  }
  return null;
}

export function adminSettingsPatchPayload(value: EditableAdminSettings, revision: number): Readonly<{ revision: number } & EditableAdminSettings> {
  return { revision, ...value };
}
