export type AlertNotificationKind = "ALERT_CONFIRMED";
export type AlertNotificationStatus = "PENDING" | "SENDING" | "SENT" | "FAILED";

export type AlertNotificationErrorCode =
  | "NETWORK"
  | "TIMEOUT"
  | "HTTP_429"
  | "HTTP_4XX"
  | "HTTP_5XX"
  | "TELEGRAM_REJECTED"
  | "INVALID_RESPONSE";

type ClaimedAlertNotificationBase = Readonly<{
  id: string;
  alertEventId: string;
  kind: AlertNotificationKind;
  status: "SENDING";
  createdAt: Date;
  availableAt: Date;
  lockedAt: Date;
  lockToken: string;
  attemptCount: number;
  lastAttemptAt: Date;
  vehicleName: string;
  timezone: string;
  confirmedAt: Date;
}>;

export type ClaimedSpeedingAlertNotification = ClaimedAlertNotificationBase & Readonly<{
  alertType: "SPEEDING";
  speedZone: "CITY" | "OUTSIDE_CITY";
  confirmationSpeedKph: number;
  speedThresholdKph: number;
}>;

export type ClaimedInactivityAlertNotification = ClaimedAlertNotificationBase & Readonly<{
  alertType: "INACTIVITY";
  confirmationTraveledDistanceMeters: number;
  distanceThresholdMeters: number;
  durationThresholdMinutes: number;
}>;

export type ClaimedAlertNotification = ClaimedSpeedingAlertNotification | ClaimedInactivityAlertNotification;

export class AlertNotificationOutboxStateError extends Error {
  public constructor(message = "Invalid alert notification outbox state") {
    super(message);
    this.name = "AlertNotificationOutboxStateError";
  }
}

export class AlertNotificationLostLeaseError extends AlertNotificationOutboxStateError {
  public constructor() {
    super("Alert notification lease was lost");
    this.name = "AlertNotificationLostLeaseError";
  }
}
