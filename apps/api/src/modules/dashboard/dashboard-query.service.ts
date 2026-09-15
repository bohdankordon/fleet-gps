import { Inject, Injectable } from "@nestjs/common";
import { isBeyondAllowedPositionFutureSkew } from "../../common/position-time.policy";
import { DailyStatSource, DataQuality, VehicleStatus } from "../../generated/prisma/client";
import type { DashboardQueryRepository, DashboardStoredVehicle } from "./dashboard-query.repository";
import { DASHBOARD_CLOCK, DASHBOARD_QUERY_REPOSITORY } from "./dashboard.tokens";
import { VehicleScopeService } from "../vehicle-access/vehicle-access.service";
import type { DashboardActivityFilter, DashboardQueryParams } from "./dashboard-query-params";
import type { DashboardDataQuality, DashboardDailyStatSource, DashboardPositionFreshness, DashboardSummary, DashboardVehicleReadModel, DashboardVehicleStatus, DashboardVehiclesResponse } from "./dashboard-read-models";
import { DailyRunsConfigurationError, type DashboardClock } from "./dashboard.types";
import type { GroupFilter, VehicleGroupOption } from "../vehicle-access/vehicle-access.types";

export class DashboardQueryInternalError extends Error { public constructor() { super("Dashboard query failed."); this.name = "DashboardQueryInternalError"; } }
function serviceDate(now: Date, timezone: string): string { try { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); const value = `${values.year ?? ""}-${values.month ?? ""}-${values.day ?? ""}`; if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(); return value; } catch { throw new DailyRunsConfigurationError(); } }
function normalizeStatus(value: VehicleStatus): DashboardVehicleStatus { if (value === VehicleStatus.ONLINE) return "online"; if (value === VehicleStatus.OFFLINE) return "offline"; if (value === VehicleStatus.UNKNOWN) return "unknown"; throw new DashboardQueryInternalError(); }
function normalizeSource(value: DailyStatSource): DashboardDailyStatSource { if (value === DailyStatSource.RUNS) return "runs"; if (value === DailyStatSource.MODE1) return "mode1"; if (value === DailyStatSource.HISTORICAL_POSITIONS) return "historical_positions"; throw new DashboardQueryInternalError(); }
function normalizeQuality(value: DataQuality): DashboardDataQuality { if (value === DataQuality.EXACT) return "exact"; if (value === DataQuality.PROVISIONAL) return "provisional"; if (value === DataQuality.ESTIMATED) return "estimated"; throw new DashboardQueryInternalError(); }
function decimalToNumber(value: unknown): number { const numberValue = typeof value === "number" ? value : typeof value === "object" && value !== null && "toNumber" in value && typeof value.toNumber === "function" ? value.toNumber() : Number.NaN; if (!Number.isFinite(numberValue)) throw new DashboardQueryInternalError(); return numberValue; }
function freshness(fixTime: Date | null, outdated: boolean | null, now: Date, thresholdSeconds: number): DashboardPositionFreshness { if (!fixTime) return "missing"; const delta = fixTime.getTime() - now.getTime(); if (isBeyondAllowedPositionFutureSkew(fixTime, now)) return "future"; if (delta > 0 || outdated === true || -delta > thresholdSeconds * 1_000) return "stale"; return "fresh"; }

function toModel(vehicle: DashboardStoredVehicle, now: Date, minimum: number, threshold: number): DashboardVehicleReadModel {
  const state = vehicle.currentState;
  const positionFreshness = freshness(state?.fixTime ?? null, state?.outdated ?? null, now, threshold);
  const stat = vehicle.dailyStat;
  const distance = stat ? decimalToNumber(stat.distanceMeters) : null;
  return {
    id: vehicle.id,
    name: vehicle.name,
    disabled: vehicle.disabled,
    group: vehicle.group ? Object.freeze({ id: vehicle.group.id, name: vehicle.group.name }) : null,
    status: state ? normalizeStatus(state.status) : "unknown",
    externalLastUpdateAt: state?.externalLastUpdateAt?.toISOString() ?? null,
    fixTime: state?.fixTime?.toISOString() ?? null,
    speedKph: state?.speedKph ?? null,
    positionValid: state?.valid ?? null,
    positionOutdated: state?.outdated ?? null,
    positionFreshness,
    dailyDistanceMeters: distance,
    dailyDistanceSource: stat ? normalizeSource(stat.source) : null,
    dailyDistanceQuality: stat ? normalizeQuality(stat.quality) : null,
    dailyDistanceStale: stat?.isStale ?? null,
    dailyDistanceDegraded: stat?.isDegraded ?? null,
    belowMinimumDistance: distance === null ? null : distance < minimum,
  };
}
function matchesActivity(vehicle: DashboardVehicleReadModel, activity: DashboardActivityFilter | undefined): boolean { return activity === undefined || (activity === "no_data" ? vehicle.dailyDistanceMeters === null : activity === "below_threshold" ? vehicle.belowMinimumDistance === true : vehicle.belowMinimumDistance === false); }
function matchesGroup(vehicle: DashboardVehicleReadModel, group: GroupFilter): boolean {
  if (group.kind === "ALL") return true;
  if (group.kind === "UNGROUPED") return vehicle.group === null;
  return vehicle.group?.id === group.groupId;
}
function groupOptions(vehicles: readonly DashboardVehicleReadModel[]): readonly VehicleGroupOption[] {
  const seen = new Map<string, string>();
  for (const vehicle of vehicles) if (vehicle.group && !seen.has(vehicle.group.id)) seen.set(vehicle.group.id, vehicle.group.name);
  return Object.freeze([...seen].map(([id, name]) => Object.freeze({ id, name })).sort((left, right) => left.name.localeCompare(right.name, "uk", { numeric: true }) || left.id.localeCompare(right.id)));
}
function compareVehicles(left: DashboardVehicleReadModel, right: DashboardVehicleReadModel): number { if (left.disabled !== right.disabled) return left.disabled ? 1 : -1; const leftName = left.name.toLowerCase(); const rightName = right.name.toLowerCase(); if (leftName < rightName) return -1; if (leftName > rightName) return 1; return left.id < right.id ? -1 : left.id > right.id ? 1 : 0; }
function summary(vehicles: readonly DashboardVehicleReadModel[]): DashboardSummary { return { total: vehicles.length, online: vehicles.filter((vehicle) => vehicle.status === "online").length, offline: vehicles.filter((vehicle) => vehicle.status === "offline").length, unknown: vehicles.filter((vehicle) => vehicle.status === "unknown").length, freshPositions: vehicles.filter((vehicle) => vehicle.positionFreshness === "fresh").length, stalePositions: vehicles.filter((vehicle) => vehicle.positionFreshness === "stale" || vehicle.positionFreshness === "future").length, withoutPosition: vehicles.filter((vehicle) => vehicle.positionFreshness === "missing").length, belowMinimumDistance: vehicles.filter((vehicle) => vehicle.belowMinimumDistance === true).length, withoutDailyStat: vehicles.filter((vehicle) => vehicle.dailyDistanceMeters === null).length }; }

@Injectable()
export class DashboardQueryService {
  public constructor(@Inject(DASHBOARD_QUERY_REPOSITORY) private readonly repository: DashboardQueryRepository, @Inject(DASHBOARD_CLOCK) private readonly clock: DashboardClock, private readonly scopes: VehicleScopeService) {}
  public async getVehicles(params: DashboardQueryParams, userId: string): Promise<DashboardVehiclesResponse> {
    const scope = await this.scopes.resolve(userId);
    const settings = await this.repository.getSettings(); const now = this.clock.now(); const date = serviceDate(now, settings.timezone); const rows = await this.repository.getVehiclesForServiceDate(date, scope);
    const needle = params.search?.toLowerCase(); const authorized = rows.map((row) => toModel(row, now, settings.minimumDailyDistanceMeters, settings.positionFreshnessSeconds));
    const groups = groupOptions(authorized); const hasUngrouped = authorized.some((vehicle) => vehicle.group === null);
    const vehicles = authorized.filter((vehicle) => matchesGroup(vehicle, params.group)).filter((vehicle) => params.includeDisabled || !vehicle.disabled).filter((vehicle) => params.status === undefined || vehicle.status === params.status).filter((vehicle) => needle === undefined || vehicle.name.toLowerCase().includes(needle)).filter((vehicle) => matchesActivity(vehicle, params.activity)).sort(compareVehicles);
    return { serviceDate: date, timezone: settings.timezone, minimumDailyDistanceMeters: settings.minimumDailyDistanceMeters, positionFreshnessSeconds: settings.positionFreshnessSeconds, summary: summary(vehicles), groups, hasUngrouped, vehicles, generatedAt: now.toISOString() };
  }
}
