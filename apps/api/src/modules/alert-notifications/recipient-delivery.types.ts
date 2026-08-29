export type RecipientDeliveryFailureCode = "ACCOUNT_DISABLED" | "ACCOUNT_SECURITY_RESTRICTED" | "PERMISSION_REVOKED" | "CONNECTION_MISSING" | "CONNECTION_NOT_CONNECTED" | "CONNECTION_REVISION_CHANGED" | "MASTER_DISABLED" | "EVENT_TYPE_DISABLED" | "VEHICLE_SCOPE_CHANGED" | "VEHICLE_DISABLED" | "NETWORK" | "TIMEOUT" | "HTTP_429" | "HTTP_4XX" | "HTTP_5XX" | "INVALID_RESPONSE" | "MAX_ATTEMPTS" | "MAX_AGE";

export class RecipientDeliveryLostLeaseError extends Error {
  public constructor() { super("Recipient delivery lease was lost"); this.name = "RecipientDeliveryLostLeaseError"; }
}

export type ClaimedRecipientDelivery = Readonly<{ id: string; notificationId: string; userId: string; connectionRevision: number; leaseToken: string; attemptCount: number; createdAt: Date }>;

export type RecipientAlertMessageSource =
  | Readonly<{ chatId: bigint; vehicleName: string; timezone: string; confirmedAt: Date; alertType: "SPEEDING"; speedZone: "CITY" | "OUTSIDE_CITY"; confirmationSpeedKph: number; speedThresholdKph: number }>
  | Readonly<{ chatId: bigint; vehicleName: string; timezone: string; confirmedAt: Date; alertType: "INACTIVITY"; confirmationTraveledDistanceMeters: number; distanceThresholdMeters: number; durationThresholdMinutes: number }>;

export type RecipientDispatchEligibility = Readonly<{ kind: "ELIGIBLE"; source: RecipientAlertMessageSource }> | Readonly<{ kind: "SUPPRESS"; code: RecipientDeliveryFailureCode }> | Readonly<{ kind: "LOST_LEASE" }>;
