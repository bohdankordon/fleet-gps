import { Injectable } from "@nestjs/common";
import { AlertEventStatus, AlertEventType, AlertNotificationKind, Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database";
import type { AlertEventsQueryParams } from "./alert-events-query-params";
import { MAX_OPEN_ALERT_MAP_EVENTS, type AlertEventsQueryRepository, type StoredAlertEventReadRow, type StoredAlertEventsPage, type StoredOpenAlertEventsSummary, type StoredOpenAlertMapSnapshot } from "./alert-events-query.repository";

const alertEventReadSelect = {
  id: true,
  type: true,
  status: true,
  confirmedAt: true,
  lastObservedAt: true,
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
        ...(params.from === undefined && params.to === undefined ? {} : {
          confirmedAt: { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lt: params.to } : {}) },
        }),
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

  public async getVehicleOptions(): Promise<readonly Readonly<{ vehicleId: string; vehicleName: string }>[]> {
    const vehicles = await this.database.getClient().vehicle.findMany({
      where: { alertEvents: { some: {} } },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return vehicles.map((vehicle) => ({ vehicleId: vehicle.id, vehicleName: vehicle.name }));
  }

  public async getOpenMapSnapshot(): Promise<StoredOpenAlertMapSnapshot> {
    const rows = await this.database.getClient().alertEvent.findMany({
      where: { status: AlertEventStatus.OPEN },
      orderBy: [{ vehicle: { name: "asc" } }, { vehicleId: "asc" }, { type: "asc" }, { confirmedAt: "asc" }, { id: "asc" }],
      take: MAX_OPEN_ALERT_MAP_EVENTS + 1,
      select: {
        type: true,
        confirmedAt: true,
        vehicle: { select: { id: true, name: true } },
      },
    });
    return Object.freeze({
      rows: Object.freeze(rows.slice(0, MAX_OPEN_ALERT_MAP_EVENTS)),
      exceededLimit: rows.length > MAX_OPEN_ALERT_MAP_EVENTS,
    });
  }
}

export const alertEventsReadSelectForTests = alertEventReadSelect;
