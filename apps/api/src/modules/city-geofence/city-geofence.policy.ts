import type { CityGeofenceClassification, SpeedLimitZone } from "./city-geofence.types";

export function classifySpeedLimitZone(classification: CityGeofenceClassification): SpeedLimitZone {
  switch (classification) {
    case "INSIDE":
    case "BOUNDARY": return "CITY";
    case "OUTSIDE": return "OUTSIDE_CITY";
    case "UNCONFIGURED":
    case "INVALID_POINT": return "UNKNOWN";
  }
}
