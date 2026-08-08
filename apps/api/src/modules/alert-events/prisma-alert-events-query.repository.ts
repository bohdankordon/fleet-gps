import { Injectable } from "@nestjs/common";
import { AlertEventStatus, AlertEventType, AlertNotificationKind, Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database";
import type { AlertEventsQueryParams } from "./alert-events-query-params";
import type { AlertEventsQueryRepository, StoredAlertEventReadRow, StoredAlertEventsPage, StoredOpenAlertEventsSummary } from "./alert-events-query.repository";

const alertEventReadSelect = {
  id: true,
  type: true,
  status: true,
  confirmedAt: true,
  resolvedAt: true,
  speedZone: true,
  confirmationSpeedKph: true,
  lastSpeedKph: true,
  peakSpeedKph: true,
  speedThresholdKph: true,
  confirmationTraveledDistanceMeters: true,
  lastTraveledDistanceMeters: true,
  minimumTraveledDistanceMeters: true,
  distanceThresholdMeters: true,
  durationThresholdMinutes: true,
  vehicle: { select: { id: true, name: true } },
  notificationOutbox: {
    where: { kind: AlertNotificationKind.ALERT_CONFIRMED },
    take: 1,
    select: { status: true },
  },
} satisfies Prisma.AlertEventSelect;

@Injectable()
export class PrismaAlertEventsQueryRepository implements AlertEventsQueryRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async list(params: AlertEventsQueryParams): Promise<StoredAlertEventsPage> {
    const rows = await this.database.getClient().alertEvent.findMany({
      where: {
        ...(params.status === undefined ? {} : { status: params.status }),
        ...(params.type === undefined ? {} : { type: params.type }),
        ...(params.vehicleId === undefined ? {} : { vehicleId: params.vehicleId }),
        ...(params.cursor === undefined ? {} : {
          OR: [
            { confirmedAt: { lt: params.cursor.openedAt } },
            { confirmedAt: params.cursor.openedAt, id: { lt: params.cursor.id } },
          ],
        }),
      },
      orderBy: [{ confirmedAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
      select: alertEventReadSelect,
    });
    return Object.freeze({ rows: Object.freeze(rows.slice(0, params.limit)) as readonly StoredAlertEventReadRow[], hasMore: rows.length > params.limit });
  }

  public async getOpenSummary(): Promise<StoredOpenAlertEventsSummary> {
    const groups = await this.database.getClient().alertEvent.groupBy({
      by: ["type"],
      where: { status: AlertEventStatus.OPEN },
      _count: { _all: true },
    });
    let speeding = 0;
    let inactivity = 0;
    for (const group of groups) {
      if (group.type === AlertEventType.SPEEDING) speeding = group._count._all;
      else if (group.type === AlertEventType.INACTIVITY) inactivity = group._count._all;
    }
    return Object.freeze({ speeding, inactivity });
  }
}

export const alertEventsReadSelectForTests = alertEventReadSelect;
