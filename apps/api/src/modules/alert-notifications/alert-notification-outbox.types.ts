export type AlertNotificationKind = "ALERT_CONFIRMED";
export type AlertNotificationStatus = "PENDING" | "SENT";

export type PendingAlertNotification = Readonly<{
  id: string;
  alertEventId: string;
  kind: AlertNotificationKind;
  status: "PENDING";
  createdAt: Date;
  attemptCount: number;
}>;
