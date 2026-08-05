import type { EquGpsConfig } from "../config/equgps-config";
import type { ExternalSpeedReport, SessionToken, VehicleDayDetails, VehicleDayParams, VehicleRoute, VehicleTrip, WebRouteClient, WebSpeedEventsClient, WebVehicleDetailsClient } from "../contracts/client-contracts";
import type { HttpTransport } from "../contracts/http";
import { EquGpsResponseValidationError } from "../errors/equgps-errors";
import { buildWebUrl } from "../internal/url-builder";
import { infoResponse, routeResponse, type DayGo } from "../transport/web-details-schemas";

const day = /^(\d{4})-(\d{2})-(\d{2})$/;
function validParams(params: VehicleDayParams): boolean { const m = day.exec(params.date); if (!Number.isInteger(params.deviceId) || params.deviceId <= 0 || m === null) return false; const [y, mo, d] = m.slice(1).map(Number); return y !== undefined && mo !== undefined && d !== undefined && mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate(); }
function optionalSpeed(v: string | null | undefined, operation: "getVehicleDayDetails" | "getVehicleRoute"): number | null { if (v === null || v === undefined || v.trim() === "") return null; const n = Number(v.trim()); if (!Number.isFinite(n)) return null; if (n < 0) throw new EquGpsResponseValidationError(operation); return n * 1.852; }
function unix(value: number | undefined, operation: "getVehicleDayDetails" | "getVehicleRoute"): string {
  if (value === undefined || !Number.isInteger(value) || value < 0) throw new EquGpsResponseValidationError(operation);

  const milliseconds = value * 1_000;
  if (!Number.isSafeInteger(milliseconds)) throw new EquGpsResponseValidationError(operation);

  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime())) throw new EquGpsResponseValidationError(operation);

  try {
    return date.toISOString();
  } catch {
    throw new EquGpsResponseValidationError(operation);
  }
}
function confirmedStringTimestamp(_value: string | undefined): null { return null; }
function location(_value: string[] | undefined): null { return null; } // Coordinate order was not confirmed by research; do not publish it.
function trip(value: DayGo, operation: "getVehicleDayDetails" | "getVehicleRoute"): VehicleTrip { if (value.startTime === undefined || value.endTime === undefined || value.distance === undefined || value.endTime < value.startTime) throw new EquGpsResponseValidationError(operation); const startedAt = unix(value.startTime, operation); const endedAt = unix(value.endTime, operation); return { startedAt, endedAt, distanceMeters: value.distance, maxSpeedKph: optionalSpeed(value.maxSpeed, operation), startLocation: location(undefined), endLocation: location(undefined), startAddress: value.startA ?? null, endAddress: value.endA ?? null, stopAfterSeconds: value.stopLongSeconds ?? null }; }
function form(mode: "mode1" | "mode2", params: VehicleDayParams): Record<string, string> { return { mode, id: String(params.deviceId), date: params.date }; }

export class DefaultWebDetailsClient implements WebVehicleDetailsClient, WebSpeedEventsClient, WebRouteClient {
  public constructor(private readonly config: EquGpsConfig, private readonly transport: HttpTransport) {}
  private async info(token: SessionToken, params: VehicleDayParams, mode: "mode1" | "mode2", operation: "getVehicleDayDetails" | "getExternalSpeedReport") {
    if (!validParams(params)) throw new EquGpsResponseValidationError(operation);
    const response = await this.transport.execute({ operation, method: "POST", url: buildWebUrl(this.config.webBaseUrl, "api/devices/info", token), headers: { Accept: "application/json" }, formBody: form(mode, params), timeoutMs: this.config.requestTimeoutMs });
    const parsed = infoResponse.safeParse(response.body); if (!parsed.success || parsed.data.length === 0 || parsed.data[0]?.infoReport === undefined) throw new EquGpsResponseValidationError(operation); return parsed.data[0].infoReport;
  }
  public async getVehicleDayDetails(token: SessionToken, params: VehicleDayParams): Promise<VehicleDayDetails> { const report = (await this.info(token, params, "mode1", "getVehicleDayDetails")).mode1; if (report === undefined) throw new EquGpsResponseValidationError("getVehicleDayDetails"); const pos = report.dataPositions; return { deviceId: params.deviceId, date: params.date, distanceMeters: pos?.distance ?? null, movementDurationSeconds: pos?.goTime ?? null, maxSpeedKph: optionalSpeed(pos?.maxSpeed, "getVehicleDayDetails"), trips: (report.dataGo ?? []).map((v) => trip(v, "getVehicleDayDetails")) }; }
  public async getExternalSpeedReport(token: SessionToken, params: VehicleDayParams): Promise<ExternalSpeedReport> { const report = (await this.info(token, params, "mode2", "getExternalSpeedReport")).mode2; if (report === undefined) throw new EquGpsResponseValidationError("getExternalSpeedReport"); return { deviceId: params.deviceId, date: params.date, configuredLimitKph: report.stateMaxSpeed ?? null, maxRecordedSpeedKph: report.maxRegSpeed ?? null, events: (report.dataSpeed ?? []).map((e) => { const latitude = Number(e.lat), longitude = Number(e.lon); if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new EquGpsResponseValidationError("getExternalSpeedReport"); return { externalEventId: e.id, deviceId: e.deviceid, occurredAt: confirmedStringTimestamp(e.fixtime), latitude, longitude, speedKph: e.speed, overPercent: e.overPercent ?? null }; }) }; }
  public async getVehicleRoute(token: SessionToken, params: VehicleDayParams): Promise<VehicleRoute> { if (!validParams(params)) throw new EquGpsResponseValidationError("getVehicleRoute"); const response = await this.transport.execute({ operation: "getVehicleRoute", method: "POST", url: buildWebUrl(this.config.webBaseUrl, "api/devices/routes-new", token), headers: { Accept: "application/json" }, formBody: { id: String(params.deviceId), date: params.date }, timeoutMs: this.config.requestTimeoutMs }); const parsed = routeResponse.safeParse(response.body); if (!parsed.success) throw new EquGpsResponseValidationError("getVehicleRoute"); const value = parsed.data; const points = (value.dataGo ?? []).flatMap((g) => (g.positions ?? []).map((p) => { const latitude = Number(p.latitude), longitude = Number(p.longitude); if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new EquGpsResponseValidationError("getVehicleRoute"); return { occurredAt: confirmedStringTimestamp(p.fixtime), latitude, longitude }; })); return { deviceId: params.deviceId, date: params.date, distanceMeters: value.dataPositions?.distance ?? null, movementDurationSeconds: value.dataPositions?.goTime ?? null, trips: (value.dataGo ?? []).map((v) => trip(v, "getVehicleRoute")), points }; }
}
