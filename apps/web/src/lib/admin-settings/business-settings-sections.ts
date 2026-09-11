import { adminSettingsFieldLabelKeys } from "../../components/admin-settings-form-model";

export const BUSINESS_SETTINGS_EDITABLE_FIELDS = Object.freeze([
  "timezone",
  "minimumDailyDistanceMeters",
  "positionFreshnessSeconds",
  "speedRuleEnabled",
  "citySpeedLimitKph",
  "outsideCitySpeedLimitKph",
  "speedToleranceKph",
  "speedingConfirmationUpdates",
  "inactivityRuleEnabled",
  "inactivityDistanceMeters",
  "inactivityDurationMinutes",
  "tripMovementSpeedKph",
  "tripMovementConfirmationSeconds",
  "tripStopConfirmationSeconds",
  "tripDataGapSeconds",
] as const);

export type BusinessSettingsEditableField = (typeof BUSINESS_SETTINGS_EDITABLE_FIELDS)[number];

export type BusinessSettingsSectionId = "day" | "speeding" | "inactivity" | "trips";

export type BusinessSettingsSectionDef = Readonly<{
  id: BusinessSettingsSectionId;
  titleKey: string;
  fields: readonly BusinessSettingsEditableField[];
}>;

export const BUSINESS_SETTINGS_SECTIONS: readonly BusinessSettingsSectionDef[] = Object.freeze([
  { id: "day", titleKey: "admin.settings.section.day", fields: ["timezone", "minimumDailyDistanceMeters", "positionFreshnessSeconds"] },
  { id: "speeding", titleKey: "admin.settings.section.speeding", fields: ["speedRuleEnabled", "citySpeedLimitKph", "outsideCitySpeedLimitKph", "speedToleranceKph", "speedingConfirmationUpdates"] },
  { id: "inactivity", titleKey: "admin.settings.section.inactivity", fields: ["inactivityRuleEnabled", "inactivityDistanceMeters", "inactivityDurationMinutes"] },
  { id: "trips", titleKey: "admin.settings.section.trips", fields: ["tripMovementSpeedKph", "tripMovementConfirmationSeconds", "tripStopConfirmationSeconds", "tripDataGapSeconds"] },
]);

export const BUSINESS_SETTINGS_FIELD_TO_SECTION: Readonly<Record<BusinessSettingsEditableField, BusinessSettingsSectionId>> = Object.freeze({
  timezone: "day",
  minimumDailyDistanceMeters: "day",
  positionFreshnessSeconds: "day",
  speedRuleEnabled: "speeding",
  citySpeedLimitKph: "speeding",
  outsideCitySpeedLimitKph: "speeding",
  speedToleranceKph: "speeding",
  speedingConfirmationUpdates: "speeding",
  inactivityRuleEnabled: "inactivity",
  inactivityDistanceMeters: "inactivity",
  inactivityDurationMinutes: "inactivity",
  tripMovementSpeedKph: "trips",
  tripMovementConfirmationSeconds: "trips",
  tripStopConfirmationSeconds: "trips",
  tripDataGapSeconds: "trips",
});

export function businessSettingsSectionForField(field: BusinessSettingsEditableField): BusinessSettingsSectionId {
  return BUSINESS_SETTINGS_FIELD_TO_SECTION[field];
}

export function businessSettingsFieldLabelKey(field: BusinessSettingsEditableField): string {
  if (field === "speedRuleEnabled") return "admin.settings.speedEnabled";
  if (field === "inactivityRuleEnabled") return "admin.settings.inactivityEnabled";
  return adminSettingsFieldLabelKeys[field as keyof typeof adminSettingsFieldLabelKeys];
}
