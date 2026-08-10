export type AlertNotificationDeliveryStatus = "NONE" | "PENDING" | "SENT" | "FAILED";

export type SpeedingAlertDetails = Readonly<{
  zone: "CITY" | "OUTSIDE_CITY";
  confirmationSpeedKph: number;
  lastSpeedKph: number;
  peakSpeedKph: number;
  thresholdKph: number;
}>;

export type InactivityAlertDetails = Readonly<{
  confirmationDistanceMeters: number;
  lastDistanceMeters: number;
  minimumDistanceMeters: number;
  distanceThresholdMeters: number;
  durationThresholdMinutes: number;
}>;

type AlertEventReadModelBase = Readonly<{
  id: string;
  vehicle: Readonly<{ id: string; name: string }>;
  status: "OPEN" | "RESOLVED";
  openedAt: string;
  resolvedAt: string | null;
  notificationDeliveryStatus: AlertNotificationDeliveryStatus;
}>;

export type AlertEventReadModel =
  | AlertEventReadModelBase & Readonly<{ type: "SPEEDING"; details: SpeedingAlertDetails }>
  | AlertEventReadModelBase & Readonly<{ type: "INACTIVITY"; details: InactivityAlertDetails }>;

export type AlertEventsListResponse = Readonly<{
  items: readonly AlertEventReadModel[];
  nextCursor: string | null;
}>;

export type AlertEventsSummaryResponse = Readonly<{
  open: Readonly<{
    total: number;
    speeding: number;
    inactivity: number;
  }>;
}>;

export type OpenAlertMapAlert = Readonly<{
  type: "SPEEDING" | "INACTIVITY";
  openedAt: string;
}>;

export type OpenAlertMapVehicle = Readonly<{
  vehicle: Readonly<{ id: string; name: string }>;
  alerts: readonly OpenAlertMapAlert[];
}>;

export type OpenAlertMapResponse = Readonly<{
  generatedAt: string;
  summary: Readonly<{
    totalOpenAlerts: number;
    vehiclesWithOpenAlerts: number;
    speeding: number;
    inactivity: number;
  }>;
  vehicles: readonly OpenAlertMapVehicle[];
}>;
