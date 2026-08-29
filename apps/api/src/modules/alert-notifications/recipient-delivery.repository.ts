import { Injectable } from "@nestjs/common";
import { AlertNotificationDeliveryStatus, AuthRole, NotificationVehicleScope, TelegramConnectionStatus, type Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database";
import { RecipientDeliveryLostLeaseError, type ClaimedRecipientDelivery, type RecipientDeliveryFailureCode, type RecipientDispatchEligibility } from "./recipient-delivery.types";

export const RECIPIENT_DELIVERY_LEASE_MS = 5 * 60_000;
export const RECIPIENT_DELIVERY_MAX_AGE_MS = 24 * 60 * 60_000;
export const MAX_RECIPIENT_DELIVERY_BATCH_SIZE = 100;

type RawClaim = Readonly<{ id: string; notificationId: string; userId: string; connectionRevision: number; leaseToken: string; attemptCount: number; createdAt: Date }>;
type DeliveryForRecheck = Prisma.AlertNotificationDeliveryGetPayload<{ include: { notification: { include: { alertEvent: { include: { vehicle: true } } } }; user: { include: { permissions: true; telegramConnection: true; notificationPreferences: { include: { vehicles: true } } } } } }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const failureCodes = new Set<RecipientDeliveryFailureCode>(["ACCOUNT_DISABLED", "ACCOUNT_SECURITY_RESTRICTED", "PERMISSION_REVOKED", "CONNECTION_MISSING", "CONNECTION_NOT_CONNECTED", "CONNECTION_REVISION_CHANGED", "MASTER_DISABLED", "EVENT_TYPE_DISABLED", "VEHICLE_SCOPE_CHANGED", "VEHICLE_DISABLED", "NETWORK", "TIMEOUT", "HTTP_429", "HTTP_4XX", "HTTP_5XX", "INVALID_RESPONSE", "MAX_ATTEMPTS", "MAX_AGE"]);

function uuid(value: string, label: string): string { if (!UUID.test(value)) throw new TypeError(`Invalid ${label}`); return value; }
function failureCode(value: RecipientDeliveryFailureCode): RecipientDeliveryFailureCode { if (!failureCodes.has(value)) throw new TypeError("Invalid recipient delivery failure code"); return value; }
export function validateRecipientDeliveryBatchLimit(limit: number): number { if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RECIPIENT_DELIVERY_BATCH_SIZE) throw new RangeError(`Recipient delivery batch limit must be an integer from 1 to ${MAX_RECIPIENT_DELIVERY_BATCH_SIZE}`); return limit; }

function evaluate(row: DeliveryForRecheck, timezone: string): RecipientDispatchEligibility {
  const user = row.user;
  if (user.disabled) return { kind: "SUPPRESS", code: "ACCOUNT_DISABLED" };
  if (user.mustChangePassword) return { kind: "SUPPRESS", code: "ACCOUNT_SECURITY_RESTRICTED" };
  const permitted = user.role === AuthRole.ADMIN || (user.permissions.some((permission) => permission.key === "events.view") && user.permissions.some((permission) => permission.key === "vehicles.view"));
  if (!permitted) return { kind: "SUPPRESS", code: "PERMISSION_REVOKED" };
  const connection = user.telegramConnection;
  if (connection === null) return { kind: "SUPPRESS", code: "CONNECTION_MISSING" };
  if (connection.status !== TelegramConnectionStatus.CONNECTED || connection.telegramUserId === null || connection.telegramChatId === null) return { kind: "SUPPRESS", code: "CONNECTION_NOT_CONNECTED" };
  if (connection.connectionRevision !== row.connectionRevision) return { kind: "SUPPRESS", code: "CONNECTION_REVISION_CHANGED" };
  const preferences = user.notificationPreferences;
  if (preferences === null || !preferences.enabled) return { kind: "SUPPRESS", code: "MASTER_DISABLED" };
  const event = row.notification.alertEvent;
  if ((event.type === "SPEEDING" && !preferences.speedingEnabled) || (event.type === "INACTIVITY" && !preferences.inactivityEnabled)) return { kind: "SUPPRESS", code: "EVENT_TYPE_DISABLED" };
  if (preferences.vehicleScope === NotificationVehicleScope.SELECTED && !preferences.vehicles.some((selection) => selection.vehicleId === event.vehicleId)) return { kind: "SUPPRESS", code: "VEHICLE_SCOPE_CHANGED" };
  if (event.vehicle.disabled) return { kind: "SUPPRESS", code: "VEHICLE_DISABLED" };
  if (event.type === "SPEEDING") {
    if (event.speedZone === null || event.confirmationSpeedKph === null || event.speedThresholdKph === null) return { kind: "SUPPRESS", code: "VEHICLE_DISABLED" };
    return { kind: "ELIGIBLE", source: { chatId: connection.telegramChatId, vehicleName: event.vehicle.name, timezone, confirmedAt: event.confirmedAt, alertType: "SPEEDING", speedZone: event.speedZone, confirmationSpeedKph: event.confirmationSpeedKph, speedThresholdKph: event.speedThresholdKph } };
  }
  if (event.confirmationTraveledDistanceMeters === null || event.distanceThresholdMeters === null || event.durationThresholdMinutes === null) return { kind: "SUPPRESS", code: "VEHICLE_DISABLED" };
  return { kind: "ELIGIBLE", source: { chatId: connection.telegramChatId, vehicleName: event.vehicle.name, timezone, confirmedAt: event.confirmedAt, alertType: "INACTIVITY", confirmationTraveledDistanceMeters: event.confirmationTraveledDistanceMeters, distanceThresholdMeters: event.distanceThresholdMeters, durationThresholdMinutes: event.durationThresholdMinutes } };
}

@Injectable()
export class RecipientDeliveryRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async expireOverAge(): Promise<void> {
    await this.database.getClient().alertNotificationDelivery.updateMany({ where: { status: { in: [AlertNotificationDeliveryStatus.PENDING, AlertNotificationDeliveryStatus.SENDING] }, createdAt: { lte: new Date(Date.now() - RECIPIENT_DELIVERY_MAX_AGE_MS) } }, data: { status: AlertNotificationDeliveryStatus.FAILED, leaseUntil: null, leaseToken: null, lastFailureCode: "MAX_AGE" } });
  }

  public async claimNext(limit: number, leaseToken: string): Promise<readonly ClaimedRecipientDelivery[]> {
    const bounded = validateRecipientDeliveryBatchLimit(limit); const token = uuid(leaseToken, "lease token");
    const rows = await this.database.getClient().$queryRaw<RawClaim[]>`
      WITH candidates AS (
        SELECT delivery."id"
        FROM "alert_notification_deliveries" AS delivery
        WHERE delivery."created_at" > clock_timestamp() - INTERVAL '24 hours'
          AND ((delivery."status" = 'PENDING' AND delivery."next_attempt_at" <= clock_timestamp()) OR (delivery."status" = 'SENDING' AND delivery."lease_until" < clock_timestamp()))
        ORDER BY delivery."next_attempt_at" ASC, delivery."created_at" ASC, delivery."id" ASC
        FOR UPDATE OF delivery SKIP LOCKED LIMIT ${bounded}
      )
      UPDATE "alert_notification_deliveries" AS delivery
      SET "status" = 'SENDING', "lease_until" = clock_timestamp() + INTERVAL '5 minutes', "lease_token" = ${token}::uuid
      FROM candidates WHERE delivery."id" = candidates."id"
      RETURNING delivery."id" AS "id", delivery."notification_id" AS "notificationId", delivery."user_id" AS "userId", delivery."connection_revision" AS "connectionRevision", delivery."lease_token"::text AS "leaseToken", delivery."attempt_count" AS "attemptCount", delivery."created_at" AS "createdAt"
    `;
    return Object.freeze(rows);
  }

  public async recheck(id: string, leaseToken: string): Promise<RecipientDispatchEligibility> {
    const client = this.database.getClient(); const delivery = await client.alertNotificationDelivery.findFirst({ where: { id: uuid(id, "delivery id"), status: AlertNotificationDeliveryStatus.SENDING, leaseToken: uuid(leaseToken, "lease token") }, include: { notification: { include: { alertEvent: { include: { vehicle: true } } } }, user: { include: { permissions: true, telegramConnection: true, notificationPreferences: { include: { vehicles: true } } } } } });
    if (delivery === null) return { kind: "LOST_LEASE" };
    const settings = await client.applicationSettings.findUnique({ where: { id: 1 }, select: { timezone: true } });
    if (settings === null) return { kind: "SUPPRESS", code: "VEHICLE_DISABLED" };
    return evaluate(delivery, settings.timezone);
  }

  public async markSuppressed(id: string, leaseToken: string, code: RecipientDeliveryFailureCode): Promise<void> { await this.transition(id, leaseToken, { status: AlertNotificationDeliveryStatus.SUPPRESSED, suppressedAt: new Date(), leaseUntil: null, leaseToken: null, lastFailureCode: failureCode(code) }); }
  public async markSent(id: string, leaseToken: string): Promise<void> { await this.transition(id, leaseToken, { status: AlertNotificationDeliveryStatus.SENT, sentAt: new Date(), leaseUntil: null, leaseToken: null, lastFailureCode: null, attemptCount: { increment: 1 } }); }
  public async releaseRetry(id: string, leaseToken: string, code: RecipientDeliveryFailureCode, delayMs: number): Promise<void> { if (!Number.isInteger(delayMs) || delayMs < 1) throw new RangeError("Retry delay must be positive"); await this.transition(id, leaseToken, { status: AlertNotificationDeliveryStatus.PENDING, attemptCount: { increment: 1 }, nextAttemptAt: new Date(Date.now() + delayMs), leaseUntil: null, leaseToken: null, lastFailureCode: failureCode(code) }); }
  public async markFailed(id: string, leaseToken: string, code: RecipientDeliveryFailureCode, breakConnection: boolean): Promise<void> {
    const deliveryId = uuid(id, "delivery id"); const token = uuid(leaseToken, "lease token");
    await this.database.getClient().$transaction(async (transaction) => {
      const updated = await transaction.alertNotificationDelivery.updateMany({ where: { id: deliveryId, status: AlertNotificationDeliveryStatus.SENDING, leaseToken: token }, data: { status: AlertNotificationDeliveryStatus.FAILED, attemptCount: { increment: 1 }, leaseUntil: null, leaseToken: null, lastFailureCode: failureCode(code) } });
      if (updated.count !== 1) throw new RecipientDeliveryLostLeaseError();
      if (breakConnection) {
        const delivery = await transaction.alertNotificationDelivery.findUnique({ where: { id: deliveryId }, select: { userId: true, connectionRevision: true } });
        if (delivery !== null) await transaction.telegramConnection.updateMany({ where: { userId: delivery.userId, status: TelegramConnectionStatus.CONNECTED, connectionRevision: delivery.connectionRevision }, data: { status: TelegramConnectionStatus.BROKEN, brokenAt: new Date() } });
      }
    });
  }

  private async transition(id: string, leaseToken: string, data: Prisma.AlertNotificationDeliveryUpdateManyMutationInput): Promise<void> {
    const updated = await this.database.getClient().alertNotificationDelivery.updateMany({ where: { id: uuid(id, "delivery id"), status: AlertNotificationDeliveryStatus.SENDING, leaseToken: uuid(leaseToken, "lease token") }, data });
    if (updated.count !== 1) throw new RecipientDeliveryLostLeaseError();
  }
}

export const recipientDeliveryRepositoryInternals = Object.freeze({ evaluate });
