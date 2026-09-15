import { Injectable } from "@nestjs/common";
import { AlertEventStatus, AlertNotificationKind, Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database";
import { applyVehicleScope } from "../vehicle-access/vehicle-access.service";
import type { VehicleScope } from "../vehicle-access/vehicle-access.types";
import { RECENT_VEHICLE_ALERT_EVENTS_LIMIT } from "./vehicle-details-read-models";
import type { StoredVehicleDetailsSnapshot, VehicleDetailsQueryRepository } from "./vehicle-details-query.repository";
import { VehicleDetailsStateError } from "./vehicle-details.types";

const readTransactionTimeoutMs = 10_000;
const maximumActiveAlerts = 2;

const eventProjectionSelect = {
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
  notificationOutbox: {
    where: { kind: AlertNotificationKind.ALERT_CONFIRMED },
    take: 1,
    select: { status: true },
  },
} satisfies Prisma.AlertEventSelect;

@Injectable()
export class PrismaVehicleDetailsQueryRepository implements VehicleDetailsQueryRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async getSnapshot(vehicleId: string, scope: VehicleScope): Promise<StoredVehicleDetailsSnapshot> {
    return this.database.getClient().$transaction(async (transaction) => {
      const settings = await transaction.applicationSettings.findUnique({
        where: { id: 1 },
        select: { timezone: true, positionFreshnessSeconds: true },
      });
      if (!settings) throw new VehicleDetailsStateError();

      const serviceDates = await transaction.$queryRaw<readonly Readonly<{ serviceDate: Date }>[]>`
        SELECT ((CURRENT_TIMESTAMP AT TIME ZONE ${settings.timezone})::date::timestamp AT TIME ZONE 'UTC') AS "serviceDate"
      `;
      const serviceDate = serviceDates[0]?.serviceDate;
      if (!(serviceDate instanceof Date) || !Number.isFinite(serviceDate.getTime())) throw new VehicleDetailsStateError();

      const storedVehicle = await transaction.vehicle.findFirst({
        where: applyVehicleScope(scope, { id: vehicleId }),
        select: {
          id: true,
          name: true,
          disabled: true,
          group: { select: { id: true, name: true, color: true } },
          currentState: { select: { status: true, fixTime: true, latitude: true, longitude: true, speedKph: true, valid: true, outdated: true } },
          dailyStats: {
            where: { serviceDate },
            take: 1,
            select: { distanceMeters: true, movementDurationSeconds: true, maxSpeedKph: true, source: true, quality: true, isStale: true, isDegraded: true },
          },
        },
      });
      if (!storedVehicle) return {
        timezone: settings.timezone,
        positionFreshnessSeconds: settings.positionFreshnessSeconds,
        serviceDate,
        vehicle: null,
        activeAlerts: [],
        activeAlertsExceededLimit: false,
        recentEvents: [],
      };

      const activeRows = await transaction.alertEvent.findMany({
        where: { vehicleId, status: AlertEventStatus.OPEN },
        orderBy: [{ type: "asc" }, { confirmedAt: "asc" }, { id: "asc" }],
        take: maximumActiveAlerts + 1,
        select: { type: true, confirmedAt: true },
      });
      const recentEvents = await transaction.alertEvent.findMany({
        where: { vehicleId },
        orderBy: [{ confirmedAt: "desc" }, { id: "desc" }],
        take: RECENT_VEHICLE_ALERT_EVENTS_LIMIT,
        select: eventProjectionSelect,
      });
      return {
        timezone: settings.timezone,
        positionFreshnessSeconds: settings.positionFreshnessSeconds,
        serviceDate,
        vehicle: {
          id: storedVehicle.id,
          name: storedVehicle.name,
          disabled: storedVehicle.disabled,
          group: storedVehicle.group ? { id: storedVehicle.group.id, name: storedVehicle.group.name, color: storedVehicle.group.color } : null,
          currentState: storedVehicle.currentState,
          dailyStat: storedVehicle.dailyStats[0] ?? null,
        },
        activeAlerts: activeRows.slice(0, maximumActiveAlerts),
        activeAlertsExceededLimit: activeRows.length > maximumActiveAlerts,
        recentEvents,
      };
    }, { timeout: readTransactionTimeoutMs, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}

export const vehicleDetailsEventProjectionSelectForTests = eventProjectionSelect;
