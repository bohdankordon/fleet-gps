export type GeoJsonPolygon = Readonly<{
  type: "Polygon";
  coordinates: readonly (readonly (readonly [number, number])[])[];
}>;

export type AlertRulesSettings = Readonly<{
  speedRuleEnabled: boolean;
  inactivityRuleEnabled: boolean;
  citySpeedLimitKph: number;
  outsideCitySpeedLimitKph: number;
  speedToleranceKph: number;
  speedingConfirmationUpdates: number;
  inactivityDistanceMeters: number;
  inactivityDurationMinutes: number;
  timezone: string;
  cityGeofence: Readonly<{ configured: boolean; geometry: GeoJsonPolygon | null }>;
  effectiveSpeedThresholds: Readonly<{ cityKph: number; outsideCityKph: number }>;
  updatedAt: string;
}>;

export type AlertSettingsStoredRow = Readonly<{
  speedRuleEnabled: unknown;
  inactivityRuleEnabled: unknown;
  citySpeedLimitKph: unknown;
  outsideCitySpeedLimitKph: unknown;
  speedToleranceKph: unknown;
  speedingConfirmationUpdates: unknown;
  inactivityDistanceMeters: unknown;
  inactivityDurationMinutes: unknown;
  timezone: unknown;
  cityGeofenceGeoJson: unknown;
  updatedAt: unknown;
}>;

export type AlertSettingsStateKind = "missing" | "invalid" | "database";

export class AlertSettingsStateError extends Error {
  public readonly kind: AlertSettingsStateKind;

  public constructor(kind: AlertSettingsStateKind) {
    super("Alert settings are unavailable.");
    this.name = "AlertSettingsStateError";
    this.kind = kind;
  }
}
