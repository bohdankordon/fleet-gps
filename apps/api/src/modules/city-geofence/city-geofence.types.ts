import type { GeoJsonPolygon } from "../alert-settings";

export type { GeoJsonPolygon } from "../alert-settings";

export type GeoPoint = Readonly<{ longitude: number; latitude: number }>;

export type CityGeofenceClassification = "INSIDE" | "OUTSIDE" | "BOUNDARY" | "UNCONFIGURED" | "INVALID_POINT";

export type SpeedLimitZone = "CITY" | "OUTSIDE_CITY" | "UNKNOWN";

export type CityGeofenceResult = Readonly<{
  classification: CityGeofenceClassification;
  speedLimitZone: SpeedLimitZone;
  geofenceConfigured: boolean;
}>;

export type CityGeofenceDiagnostic = Readonly<{
  configured: boolean;
  classificationAvailable: boolean;
  boundaryPolicy: "CITY";
  updatedAt: string;
}>;

export type CityGeofencePolygon = GeoJsonPolygon;
