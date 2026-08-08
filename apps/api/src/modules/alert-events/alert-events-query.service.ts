import { Inject, Injectable } from "@nestjs/common";
import { AlertEventSpeedZone, AlertEventType, AlertNotificationStatus } from "../../generated/prisma/client";
import type { AlertEventReadModel, AlertEventsListResponse, AlertEventsSummaryResponse, AlertNotificationDeliveryStatus } from "./alert-events-read-models";
import { encodeAlertEventsCursor, type AlertEventsQueryParams } from "./alert-events-query-params";
import type { AlertEventsQueryRepository, StoredAlertEventReadRow } from "./alert-events-query.repository";
import { ALERT_EVENTS_QUERY_REPOSITORY } from "./alert-events.tokens";

export class AlertEventsQueryStateError extends Error {
  public constructor() {
    super("Invalid persisted alert event read state.");
    this.name = "AlertEventsQueryStateError";
  }
}

function finite(value: number | null): number {
  if (value === null || !Number.isFinite(value)) throw new AlertEventsQueryStateError();
  return value;
}

function positiveInteger(value: number | null): number {
  if (value === null || !Number.isInteger(value) || value <= 0) throw new AlertEventsQueryStateError();
  return value;
}

function deliveryStatus(row: StoredAlertEventReadRow): AlertNotificationDeliveryStatus {
  const status = row.notificationOutbox[0]?.status;
  if (status === undefined) return "NONE";
  if (status === AlertNotificationStatus.PENDING || status === AlertNotificationStatus.SENDING) return "PENDING";
  if (status === AlertNotificationStatus.SENT) return "SENT";
  if (status === AlertNotificationStatus.FAILED) return "FAILED";
  throw new AlertEventsQueryStateError();
}

function iso(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new AlertEventsQueryStateError();
  return value.toISOString();
}

function toReadModel(row: StoredAlertEventReadRow): AlertEventReadModel {
  const common = {
    id: row.id,
    vehicle: Object.freeze({ id: row.vehicle.id, name: row.vehicle.name }),
    status: row.status,
    openedAt: iso(row.confirmedAt),
    resolvedAt: row.resolvedAt === null ? null : iso(row.resolvedAt),
    notificationDeliveryStatus: deliveryStatus(row),
  } as const;
  if (row.type === AlertEventType.SPEEDING) {
    if (row.speedZone !== AlertEventSpeedZone.CITY && row.speedZone !== AlertEventSpeedZone.OUTSIDE_CITY) throw new AlertEventsQueryStateError();
    return Object.freeze({ ...common, type: "SPEEDING", details: Object.freeze({ zone: row.speedZone, confirmationSpeedKph: finite(row.confirmationSpeedKph), lastSpeedKph: finite(row.lastSpeedKph), peakSpeedKph: finite(row.peakSpeedKph), thresholdKph: finite(row.speedThresholdKph) }) });
  }
  if (row.type === AlertEventType.INACTIVITY) {
    return Object.freeze({ ...common, type: "INACTIVITY", details: Object.freeze({ confirmationDistanceMeters: finite(row.confirmationTraveledDistanceMeters), lastDistanceMeters: finite(row.lastTraveledDistanceMeters), minimumDistanceMeters: finite(row.minimumTraveledDistanceMeters), distanceThresholdMeters: finite(row.distanceThresholdMeters), durationThresholdMinutes: positiveInteger(row.durationThresholdMinutes) }) });
  }
  throw new AlertEventsQueryStateError();
}

@Injectable()
export class AlertEventsQueryService {
  public constructor(@Inject(ALERT_EVENTS_QUERY_REPOSITORY) private readonly repository: AlertEventsQueryRepository) {}

  public async list(params: AlertEventsQueryParams): Promise<AlertEventsListResponse> {
    const page = await this.repository.list(params);
    const items = Object.freeze(page.rows.map(toReadModel));
    const last = page.rows.at(-1);
    const nextCursor = page.hasMore && last !== undefined ? encodeAlertEventsCursor({ openedAt: last.confirmedAt, id: last.id }) : null;
    return Object.freeze({ items, nextCursor });
  }

  public async getSummary(): Promise<AlertEventsSummaryResponse> {
    const summary = await this.repository.getOpenSummary();
    return Object.freeze({ open: Object.freeze({ total: summary.speeding + summary.inactivity, speeding: summary.speeding, inactivity: summary.inactivity }) });
  }
}

export const alertEventsQueryServiceInternals = Object.freeze({ deliveryStatus, toReadModel });
