import { Inject, Injectable } from "@nestjs/common";
import { AlertEventType } from "../../generated/prisma/client";
import { projectAlertEventTimestamp, projectOpenAlert, projectScopedAlertEvent } from "./alert-event-read.projection";
import type { AlertEventReadModel, AlertEventsListResponse, AlertEventsSummaryResponse, AlertEventsVehicleOption, OpenAlertMapAlert, OpenAlertMapResponse, OpenAlertMapVehicle, SpeedingEventInvestigationResponse } from "./alert-events-read-models";
import { encodeAlertEventsCursor, type AlertEventsQueryParams } from "./alert-events-query-params";
import type { AlertEventsQueryRepository, StoredAlertEventReadRow, StoredOpenAlertMapRow } from "./alert-events-query.repository";
import { ALERT_EVENTS_QUERY_CLOCK, ALERT_EVENTS_QUERY_REPOSITORY } from "./alert-events.tokens";
import { VehicleScopeService } from "../vehicle-access/vehicle-access.service";

export type AlertEventsQueryClock = Readonly<{ now(): Date }>;
const systemClock: AlertEventsQueryClock = Object.freeze({ now: () => new Date() });

export class AlertEventsQueryStateError extends Error {
  public constructor() {
    super("Invalid persisted alert event read state.");
    this.name = "AlertEventsQueryStateError";
  }
}

export class AlertEventInvestigationNotFoundError extends Error {
  public constructor() { super("Alert event investigation is unavailable."); this.name = "AlertEventInvestigationNotFoundError"; }
}

function finiteInvestigationMetric(value: number | null): number {
  if (value === null || !Number.isFinite(value)) throw new AlertEventsQueryStateError();
  return value;
}

function finiteCoordinate(value: number | null, minimum: number, maximum: number): number {
  if (value === null || !Number.isFinite(value) || value < minimum || value > maximum) throw new AlertEventsQueryStateError();
  return value;
}

function toReadModel(row: StoredAlertEventReadRow): AlertEventReadModel {
  const scoped = projectScopedAlertEvent(row);
  return Object.freeze({
    id: scoped.id,
    vehicle: Object.freeze({ id: row.vehicle.id, name: row.vehicle.name, group: row.vehicle.group ? Object.freeze({ id: row.vehicle.group.id, name: row.vehicle.group.name, color: row.vehicle.group.color }) : null }),
    type: scoped.type,
    status: scoped.status,
    openedAt: scoped.openedAt,
    lastObservedAt: projectAlertEventTimestamp(row.lastObservedAt),
    resolvedAt: scoped.resolvedAt,
    notificationDeliveryStatus: scoped.notificationDeliveryStatus,
    details: scoped.details,
  } as AlertEventReadModel);
}

@Injectable()
export class AlertEventsQueryService {
  public constructor(
    @Inject(ALERT_EVENTS_QUERY_REPOSITORY) private readonly repository: AlertEventsQueryRepository,
    @Inject(ALERT_EVENTS_QUERY_CLOCK) private readonly clock: AlertEventsQueryClock = systemClock,
    private readonly scopes: VehicleScopeService,
  ) {}

  public async list(params: AlertEventsQueryParams, userId: string): Promise<AlertEventsListResponse> {
    const page = await this.repository.list(params, await this.scopes.resolve(userId));
    const items = Object.freeze(page.rows.map(toReadModel));
    const last = page.rows.at(-1);
    const nextCursor = page.hasMore && last !== undefined ? encodeAlertEventsCursor({ openedAt: last.confirmedAt, id: last.id }) : null;
    return Object.freeze({ items, nextCursor });
  }

  public async getSummary(userId: string): Promise<AlertEventsSummaryResponse> {
    const summary = await this.repository.getOpenSummary(await this.scopes.resolve(userId));
    return Object.freeze({ open: Object.freeze({ total: summary.speeding + summary.inactivity, speeding: summary.speeding, inactivity: summary.inactivity }) });
  }

  public async getVehicleOptions(userId: string): Promise<readonly AlertEventsVehicleOption[]> {
    const options = await this.repository.getVehicleOptions(await this.scopes.resolve(userId));
    return options.map(({ vehicleId, vehicleName, group }) => ({ vehicleId, vehicleName, group: group ? { id: group.id, name: group.name, color: group.color } : null }))
      .sort((a, b) => a.vehicleName.localeCompare(b.vehicleName, "uk", { numeric: true }) || a.vehicleId.localeCompare(b.vehicleId));
  }

  public async getSpeedingInvestigation(eventId: string, userId: string): Promise<SpeedingEventInvestigationResponse> {
    if (!this.repository.findSpeedingInvestigation) throw new AlertEventsQueryStateError();
    const row = await this.repository.findSpeedingInvestigation(eventId, await this.scopes.resolve(userId));
    if (row === null) throw new AlertEventInvestigationNotFoundError();
    const latitude = row.confirmationLatitude;
    const longitude = row.confirmationLongitude;
    const pairIsNull = latitude === null && longitude === null;
    if ((!pairIsNull && (latitude === null || longitude === null || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180))
      || row.type !== AlertEventType.SPEEDING || (row.speedZone !== "CITY" && row.speedZone !== "OUTSIDE_CITY")) throw new AlertEventsQueryStateError();
    const speedingSegments = row.confirmations.flatMap((confirmation) => {
      const values = [confirmation.speedingStreakStartedAt, confirmation.speedingStreakStartLatitude, confirmation.speedingStreakStartLongitude, confirmation.lastSpeedingObservedAt, confirmation.lastSpeedingLatitude, confirmation.lastSpeedingLongitude];
      if (values.every((value) => value === null)) return [];
      if (values.some((value) => value === null)) throw new AlertEventsQueryStateError();
      const startedAt = confirmation.speedingStreakStartedAt!; const lastAt = confirmation.lastSpeedingObservedAt!;
      if (!(startedAt instanceof Date) || !Number.isFinite(startedAt.getTime()) || !(confirmation.observedAt instanceof Date) || !Number.isFinite(confirmation.observedAt.getTime()) || !(lastAt instanceof Date) || !Number.isFinite(lastAt.getTime()) || startedAt > confirmation.observedAt || confirmation.observedAt > lastAt) throw new AlertEventsQueryStateError();
      return [Object.freeze({
        startedAt: projectAlertEventTimestamp(startedAt),
        confirmedAt: projectAlertEventTimestamp(confirmation.observedAt),
        startPosition: Object.freeze({ latitude: finiteCoordinate(confirmation.speedingStreakStartLatitude, -90, 90), longitude: finiteCoordinate(confirmation.speedingStreakStartLongitude, -180, 180) }),
        lastSpeedingObservedAt: projectAlertEventTimestamp(lastAt),
        lastSpeedingPosition: Object.freeze({ latitude: finiteCoordinate(confirmation.lastSpeedingLatitude, -90, 90), longitude: finiteCoordinate(confirmation.lastSpeedingLongitude, -180, 180) }),
      })];
    });
    return Object.freeze({
      eventId: row.id,
      type: "SPEEDING",
      vehicleId: row.vehicleId,
      confirmedAt: projectAlertEventTimestamp(row.confirmedAt),
      confirmationPosition: pairIsNull ? null : Object.freeze({ latitude: latitude!, longitude: longitude! }),
      confirmationSpeedKph: finiteInvestigationMetric(row.confirmationSpeedKph),
      thresholdKph: finiteInvestigationMetric(row.speedThresholdKph),
      zone: row.speedZone,
      speedingSegments: Object.freeze(speedingSegments),
    });
  }

  public async getOpenMap(userId: string): Promise<OpenAlertMapResponse> {
    const snapshot = await this.repository.getOpenMapSnapshot(await this.scopes.resolve(userId));
    const generatedAt = this.clock.now();
    if (!(generatedAt instanceof Date) || !Number.isFinite(generatedAt.getTime()) || snapshot.exceededLimit) throw new AlertEventsQueryStateError();

    const ordered = [...snapshot.rows].sort(compareOpenMapRows);
    const vehicles: OpenAlertMapVehicle[] = [];
    let speeding = 0;
    let inactivity = 0;
    for (const row of ordered) {
      const alert = projectOpenAlert(row.type, row.confirmedAt);
      const type = alert.type;
      const current = vehicles.at(-1);
      if (current?.vehicle.id === row.vehicle.id) {
        if (current.alerts.some((item) => item.type === type)) throw new AlertEventsQueryStateError();
        (current.alerts as OpenAlertMapAlert[]).push(alert);
      } else {
        vehicles.push(Object.freeze({ vehicle: Object.freeze({ id: row.vehicle.id, name: row.vehicle.name, group: row.vehicle.group ? Object.freeze({ id: row.vehicle.group.id, name: row.vehicle.group.name, color: row.vehicle.group.color }) : null }), alerts: [alert] }));
      }
      if (type === "SPEEDING") speeding += 1;
      else inactivity += 1;
    }
    for (const vehicle of vehicles) Object.freeze(vehicle.alerts);
    return Object.freeze({
      generatedAt: generatedAt.toISOString(),
      summary: Object.freeze({ totalOpenAlerts: speeding + inactivity, vehiclesWithOpenAlerts: vehicles.length, speeding, inactivity }),
      vehicles: Object.freeze(vehicles),
    });
  }
}

function openMapType(row: StoredOpenAlertMapRow): "SPEEDING" | "INACTIVITY" {
  if (row.type === AlertEventType.SPEEDING) return "SPEEDING";
  if (row.type === AlertEventType.INACTIVITY) return "INACTIVITY";
  throw new AlertEventsQueryStateError();
}

function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function openMapTypeOrder(row: StoredOpenAlertMapRow): number { return openMapType(row) === "SPEEDING" ? 0 : 1; }
function compareOpenMapRows(left: StoredOpenAlertMapRow, right: StoredOpenAlertMapRow): number {
  return compareText(left.vehicle.name, right.vehicle.name)
    || compareText(left.vehicle.id, right.vehicle.id)
    || openMapTypeOrder(left) - openMapTypeOrder(right)
    || left.confirmedAt.getTime() - right.confirmedAt.getTime();
}

export const alertEventsQueryServiceInternals = Object.freeze({ toReadModel });
