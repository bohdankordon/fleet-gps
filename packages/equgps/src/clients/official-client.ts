import type { EquGpsConfig } from "../config/equgps-config";
import type { EquGpsDevice, EquGpsPosition, HistoricalPositionsParams, OfficialEquGpsClient, SessionToken } from "../contracts/client-contracts";
import type { HttpTransport } from "../contracts/http";
import { EquGpsResponseValidationError } from "../errors/equgps-errors";
import { createBasicAuthorization } from "../internal/basic-auth";
import { buildOfficialUrl } from "../internal/url-builder";
import { devicesResponseSchema, positionsResponseSchema, sessionResponseSchema } from "../transport/schemas";

function nullable<T>(value: T | null | undefined): T | null { return value ?? null; }
const zonedIsoDateTime = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
function isStrictZonedIsoDateTime(value: string): boolean {
  const match = zonedIsoDateTime.exec(value);
  if (match === null) return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  if (year === undefined || month === undefined || day === undefined || hour === undefined || minute === undefined || second === undefined) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth && hour <= 23 && minute <= 59 && second <= 59 && Number.isFinite(Date.parse(value));
}
function validHistoricalParams(params: HistoricalPositionsParams): boolean {
  const from = Date.parse(params.from);
  const to = Date.parse(params.to);
  return Number.isInteger(params.deviceId) && params.deviceId > 0 && isStrictZonedIsoDateTime(params.from) && isStrictZonedIsoDateTime(params.to) && Number.isFinite(from) && Number.isFinite(to) && from < to;
}

export class DefaultOfficialEquGpsClient implements OfficialEquGpsClient {
  public constructor(private readonly config: EquGpsConfig, private readonly transport: HttpTransport) {}
  private basicHeaders(): Readonly<Record<string, string>> {
    return { Accept: "application/json", Authorization: createBasicAuthorization(this.config.email, this.config.password) };
  }
  public async createSession(): Promise<SessionToken> {
    const response = await this.transport.execute({ operation: "createSession", method: "POST", url: buildOfficialUrl(this.config.officialBaseUrl, "session"), headers: { Accept: "application/json" }, formBody: { email: this.config.email, password: this.config.password }, timeoutMs: this.config.requestTimeoutMs });
    const result = sessionResponseSchema.safeParse(response.body);
    if (!result.success) throw new EquGpsResponseValidationError("createSession");
    return result.data.token as SessionToken;
  }
  public async getDevices(): Promise<readonly EquGpsDevice[]> {
    const response = await this.transport.execute({ operation: "getDevices", method: "GET", url: buildOfficialUrl(this.config.officialBaseUrl, "devices"), headers: this.basicHeaders(), timeoutMs: this.config.requestTimeoutMs });
    const result = devicesResponseSchema.safeParse(response.body);
    if (!result.success) throw new EquGpsResponseValidationError("getDevices");
    return result.data.map((device) => ({ id: device.id, name: nullable(device.name), status: nullable(device.status), disabled: nullable(device.disabled), lastUpdate: nullable(device.lastUpdate) }));
  }
  public async getLatestPositions(): Promise<readonly EquGpsPosition[]> {
    return this.getPositions("getLatestPositions");
  }
  public async getHistoricalPositions(params: HistoricalPositionsParams): Promise<readonly EquGpsPosition[]> {
    if (!validHistoricalParams(params)) throw new EquGpsResponseValidationError("getHistoricalPositions");
    return this.getPositions("getHistoricalPositions", { deviceId: String(params.deviceId), from: params.from, to: params.to });
  }
  private async getPositions(operation: "getLatestPositions" | "getHistoricalPositions", query?: Readonly<Record<string, string>>): Promise<readonly EquGpsPosition[]> {
    const response = await this.transport.execute({ operation, method: "GET", url: buildOfficialUrl(this.config.officialBaseUrl, "positions", query), headers: this.basicHeaders(), timeoutMs: this.config.requestTimeoutMs });
    const result = positionsResponseSchema.safeParse(response.body);
    if (!result.success) throw new EquGpsResponseValidationError(operation);
    return result.data.map((position) => ({ deviceId: position.deviceId, fixTime: nullable(position.fixTime), valid: nullable(position.valid), outdated: nullable(position.outdated), speedKnots: nullable(position.speed), latitude: nullable(position.latitude), longitude: nullable(position.longitude) }));
  }
}
