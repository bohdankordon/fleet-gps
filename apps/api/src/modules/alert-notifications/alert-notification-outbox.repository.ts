import { Injectable } from "@nestjs/common";
import type { PrismaClient } from "../../generated/prisma/client";
import { DatabaseService } from "../database";
import { AlertNotificationLostLeaseError, AlertNotificationOutboxStateError, type AlertNotificationErrorCode, type ClaimedAlertNotification } from "./alert-notification-outbox.types";

export const MAX_ALERT_NOTIFICATION_BATCH_SIZE = 100;
export const ALERT_NOTIFICATION_LEASE_MINUTES = 5;
export const ALERT_NOTIFICATION_LEASE_MS = ALERT_NOTIFICATION_LEASE_MINUTES * 60_000;

type RawClaimedAlertNotification = Readonly<{
  id: string;
  alertEventId: string;
  kind: string;
  status: string;
  createdAt: Date;
  availableAt: Date;
  lockedAt: Date;
  lockToken: string;
  attemptCount: number;
  lastAttemptAt: Date;
  alertType: string;
  confirmedAt: Date;
  speedZone: string | null;
  confirmationSpeedKph: number | null;
  speedThresholdKph: number | null;
  confirmationTraveledDistanceMeters: number | null;
  distanceThresholdMeters: number | null;
  durationThresholdMinutes: number | null;
  vehicleName: string;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERROR_CODES: ReadonlySet<string> = new Set<AlertNotificationErrorCode>(["NETWORK", "TIMEOUT", "HTTP_429", "HTTP_4XX", "HTTP_5XX", "TELEGRAM_REJECTED", "INVALID_RESPONSE"]);

export function validateAlertNotificationBatchLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ALERT_NOTIFICATION_BATCH_SIZE) {
    throw new RangeError(`Alert notification batch limit must be an integer from 1 to ${MAX_ALERT_NOTIFICATION_BATCH_SIZE}`);
  }
  return limit;
}

function validateUuid(value: string, field: string): string {
  if (!UUID.test(value)) throw new TypeError(`Invalid ${field}`);
  return value;
}

function validateErrorCode(value: AlertNotificationErrorCode): AlertNotificationErrorCode {
  if (!ERROR_CODES.has(value)) throw new TypeError("Invalid alert notification error code");
  return value;
}

function requireFinite(value: number | null, field: string): number {
  if (value === null || !Number.isFinite(value)) throw new AlertNotificationOutboxStateError(`Invalid ${field} snapshot`);
  return value;
}

function toClaimed(row: RawClaimedAlertNotification, timezone: string): ClaimedAlertNotification {
  if (row.kind !== "ALERT_CONFIRMED" || row.status !== "SENDING" || !UUID.test(row.lockToken) || row.attemptCount < 1) {
    throw new AlertNotificationOutboxStateError();
  }
  const base = {
    id: row.id,
    alertEventId: row.alertEventId,
    kind: "ALERT_CONFIRMED" as const,
    status: "SENDING" as const,
    createdAt: row.createdAt,
    availableAt: row.availableAt,
    lockedAt: row.lockedAt,
    lockToken: row.lockToken,
    attemptCount: row.attemptCount,
    lastAttemptAt: row.lastAttemptAt,
    vehicleName: row.vehicleName,
    timezone,
    confirmedAt: row.confirmedAt,
  };
  if (row.alertType === "SPEEDING") {
    if (row.speedZone !== "CITY" && row.speedZone !== "OUTSIDE_CITY") throw new AlertNotificationOutboxStateError("Invalid speed zone snapshot");
    return Object.freeze({ ...base, alertType: "SPEEDING", speedZone: row.speedZone, confirmationSpeedKph: requireFinite(row.confirmationSpeedKph, "confirmation speed"), speedThresholdKph: requireFinite(row.speedThresholdKph, "speed threshold") });
  }
  if (row.alertType === "INACTIVITY") {
    const duration = row.durationThresholdMinutes;
    if (duration === null || !Number.isInteger(duration) || duration <= 0) throw new AlertNotificationOutboxStateError("Invalid duration threshold snapshot");
    return Object.freeze({ ...base, alertType: "INACTIVITY", confirmationTraveledDistanceMeters: requireFinite(row.confirmationTraveledDistanceMeters, "confirmation distance"), distanceThresholdMeters: requireFinite(row.distanceThresholdMeters, "distance threshold"), durationThresholdMinutes: duration });
  }
  throw new AlertNotificationOutboxStateError("Invalid alert type snapshot");
}

@Injectable()
export class AlertNotificationOutboxRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async claimNextBatch(limit: number, lockToken: string): Promise<readonly ClaimedAlertNotification[]> {
    const boundedLimit = validateAlertNotificationBatchLimit(limit);
    const token = validateUuid(lockToken, "lock token");
    const client = this.database.getClient();
    const settings = await client.applicationSettings.findUnique({ where: { id: 1 }, select: { timezone: true } });
    if (settings === null) throw new AlertNotificationOutboxStateError("Application settings are missing");

    const rows = await client.$queryRaw<RawClaimedAlertNotification[]>`
      WITH candidates AS (
        SELECT outbox."id"
        FROM "alert_notification_outbox" AS outbox
        WHERE
          (outbox."status" = 'PENDING' AND outbox."available_at" <= clock_timestamp())
          OR
          (outbox."status" = 'SENDING' AND outbox."locked_at" <= clock_timestamp() - INTERVAL '5 minutes')
        ORDER BY outbox."available_at" ASC, outbox."created_at" ASC, outbox."id" ASC
        FOR UPDATE OF outbox SKIP LOCKED
        LIMIT ${boundedLimit}
      ), claimed AS (
        UPDATE "alert_notification_outbox" AS outbox
        SET
          "status" = 'SENDING',
          "locked_at" = clock_timestamp(),
          "lock_token" = ${token}::uuid,
          "attempt_count" = outbox."attempt_count" + 1,
          "last_attempt_at" = clock_timestamp(),
          "last_error_code" = NULL
        FROM candidates
        WHERE outbox."id" = candidates."id"
        RETURNING outbox.*
      )
      SELECT
        claimed."id" AS "id",
        claimed."alert_event_id" AS "alertEventId",
        claimed."kind" AS "kind",
        claimed."status" AS "status",
        claimed."created_at" AS "createdAt",
        claimed."available_at" AS "availableAt",
        claimed."locked_at" AS "lockedAt",
        claimed."lock_token" AS "lockToken",
        claimed."attempt_count" AS "attemptCount",
        claimed."last_attempt_at" AS "lastAttemptAt",
        event."type" AS "alertType",
        event."confirmed_at" AS "confirmedAt",
        event."speed_zone" AS "speedZone",
        event."confirmation_speed_kph" AS "confirmationSpeedKph",
        event."speed_threshold_kph" AS "speedThresholdKph",
        event."confirmation_traveled_distance_meters" AS "confirmationTraveledDistanceMeters",
        event."distance_threshold_meters" AS "distanceThresholdMeters",
        event."duration_threshold_minutes" AS "durationThresholdMinutes",
        vehicle."name" AS "vehicleName"
      FROM claimed
      INNER JOIN "alert_events" AS event ON event."id" = claimed."alert_event_id"
      INNER JOIN "vehicles" AS vehicle ON vehicle."id" = event."vehicle_id"
      ORDER BY claimed."created_at" ASC, claimed."id" ASC
    `;
    return Object.freeze(rows.map((row) => toClaimed(row, settings.timezone)));
  }

  public async markSent(id: string, lockToken: string): Promise<void> {
    const rows = await this.database.getClient().$queryRaw<readonly { id: string }[]>`
      UPDATE "alert_notification_outbox"
      SET "status" = 'SENT', "sent_at" = clock_timestamp(), "locked_at" = NULL, "lock_token" = NULL, "last_error_code" = NULL
      WHERE "id" = ${validateUuid(id, "notification id")}::uuid AND "status" = 'SENDING' AND "lock_token" = ${validateUuid(lockToken, "lock token")}::uuid
      RETURNING "id"
    `;
    if (rows.length !== 1) throw new AlertNotificationLostLeaseError();
  }

  public async releaseForRetry(id: string, lockToken: string, errorCode: AlertNotificationErrorCode, retryDelayMs: number): Promise<void> {
    if (!Number.isInteger(retryDelayMs) || retryDelayMs < 1) throw new RangeError("Retry delay must be a positive integer");
    const rows = await this.database.getClient().$queryRaw<readonly { id: string }[]>`
      UPDATE "alert_notification_outbox"
      SET
        "status" = 'PENDING',
        "available_at" = clock_timestamp() + (${retryDelayMs} * INTERVAL '1 millisecond'),
        "locked_at" = NULL,
        "lock_token" = NULL,
        "last_error_code" = ${validateErrorCode(errorCode)}
      WHERE "id" = ${validateUuid(id, "notification id")}::uuid AND "status" = 'SENDING' AND "lock_token" = ${validateUuid(lockToken, "lock token")}::uuid
      RETURNING "id"
    `;
    if (rows.length !== 1) throw new AlertNotificationLostLeaseError();
  }

  public async markFailed(id: string, lockToken: string, errorCode: AlertNotificationErrorCode): Promise<void> {
    const rows = await this.database.getClient().$queryRaw<readonly { id: string }[]>`
      UPDATE "alert_notification_outbox"
      SET "status" = 'FAILED', "locked_at" = NULL, "lock_token" = NULL, "last_error_code" = ${validateErrorCode(errorCode)}
      WHERE "id" = ${validateUuid(id, "notification id")}::uuid AND "status" = 'SENDING' AND "lock_token" = ${validateUuid(lockToken, "lock token")}::uuid
      RETURNING "id"
    `;
    if (rows.length !== 1) throw new AlertNotificationLostLeaseError();
  }
}

export const alertNotificationOutboxRepositoryInternals = Object.freeze({ toClaimed });
