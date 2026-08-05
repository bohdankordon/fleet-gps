import type { EqugpsConfig } from "../config.js";
import type { ZodError, ZodType } from "zod";
import type { HeadersInit } from "undici-types";
import { createSafeHttpDiagnostic, EqugpsError, httpErrorMessage } from "./equgps-errors.js";
import { positionsSchema, type Position } from "./equgps-position-schemas.js";
import { reportSummariesSchema, type ReportSummary } from "./equgps-summary-schemas.js";
import { devicesSchema, type Device } from "./equgps-schemas.js";
import { sessionSchema, type EqugpsSession } from "./equgps-session-schemas.js";

export type SafeResponseMetadata = {
  status: number;
  contentType: string | undefined;
  hasContentDispositionAttachment: boolean;
};

export type JsonResponse<T> = {
  data: T;
  metadata: SafeResponseMetadata;
};

export type SessionResponse = { session: EqugpsSession; status: number };

export function serializeSessionForm(email: string, password: string): string {
  return new URLSearchParams({ email, password }).toString();
}

export function createJsonHeaders(config: EqugpsConfig, additionalHeaders?: HeadersInit): Headers {
  const headers = new Headers(additionalHeaders);
  headers.delete("content-type");
  headers.set("Authorization", `Basic ${Buffer.from(`${config.email}:${config.password}`).toString("base64")}`);
  // Set Accept last so no standard or caller-supplied header can choose XLSX or */*.
  headers.set("Accept", "application/json");
  return headers;
}

function getValueAtPath(value: unknown, path: PropertyKey[]): unknown {
  let current = value;

  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === "number") {
      current = current[segment];
    } else if (current !== null && typeof current === "object" && segment in current) {
      current = (current as Record<PropertyKey, unknown>)[segment];
    } else {
      return undefined;
    }
  }

  return current;
}

function getValueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function formatValidationIssues(error: ZodError, body: unknown): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.join(".") || "response";
      const actualType = getValueType(getValueAtPath(body, issue.path));
      const field = issue.path.at(-1);
      const expectedType =
        field === "lastUpdate" || field === "deviceTime" || field === "fixTime" || field === "serverTime"
          ? "non-empty string, null, or undefined"
          : "expected" in issue && typeof issue.expected === "string"
          ? issue.expected
          : "schema-compatible value";
      return `${path} [${issue.code}]: expected ${expectedType}; received ${actualType}`;
    })
    .join(", ");
}

async function createHttpError(response: Response, endpoint: string): Promise<EqugpsError> {
  const diagnostic = response.status === 400
    ? createSafeHttpDiagnostic(
        response.status,
        response.headers.get("content-type"),
        await response.text(),
        response.headers.get("content-disposition"),
      )
    : undefined;
  return new EqugpsError("http", httpErrorMessage(response.status, endpoint), response.status, diagnostic);
}

export class EqugpsClient {
  public constructor(private readonly config: EqugpsConfig) {}

  private async getJson<T>(
    endpoint: string,
    schema: ZodType<T>,
    configureQuery?: (params: URLSearchParams) => void,
    additionalHeaders?: HeadersInit,
  ): Promise<JsonResponse<T>> {
    const url = new URL(endpoint, this.config.baseUrl);
    configureQuery?.(url.searchParams);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: createJsonHeaders(this.config, additionalHeaders),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) throw new EqugpsError("timeout", "eQuGPS request timed out.");
      throw new EqugpsError("network", "Unable to reach eQuGPS. Check network access and EQUGPS_BASE_URL.");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) throw await createHttpError(response, `/${endpoint}`);

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new EqugpsError("invalid_json", `eQuGPS returned invalid JSON for /${endpoint}.`, response.status, {
        status: response.status,
        contentType: response.headers.get("content-type") ?? undefined,
        hasContentDispositionAttachment: /\battachment\b/i.test(response.headers.get("content-disposition") ?? ""),
        message: undefined,
        parameter: undefined,
        code: undefined,
        exceptionType: "unknown",
        stackFrames: [],
      });
    }

    const result = schema.safeParse(body);
    if (!result.success) {
      const details = formatValidationIssues(result.error, body);
      throw new EqugpsError(
        "invalid_response",
        `eQuGPS response for /${endpoint} does not match the expected schema${details ? ` (${details})` : ""}.`,
      );
    }

    return {
      data: result.data,
      metadata: {
        status: response.status,
        contentType: response.headers.get("content-type") ?? undefined,
        hasContentDispositionAttachment: /\battachment\b/i.test(response.headers.get("content-disposition") ?? ""),
      },
    };
  }

  public async createSession(): Promise<SessionResponse> {
    const url = new URL("session", this.config.baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: serializeSessionForm(this.config.email, this.config.password),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) throw new EqugpsError("timeout", "eQuGPS session request timed out.");
      throw new EqugpsError("network", "Unable to reach eQuGPS session endpoint. Check network access and EQUGPS_BASE_URL.");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // Session errors intentionally do not read or retain a server body: it could echo form credentials.
      throw new EqugpsError("http", `eQuGPS session request failed (HTTP ${response.status}).`, response.status);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new EqugpsError("invalid_json", "eQuGPS returned invalid JSON for /session.", response.status);
    }
    const result = sessionSchema.safeParse(body);
    if (!result.success) {
      const details = formatValidationIssues(result.error, body);
      throw new EqugpsError(
        "invalid_response",
        `eQuGPS response for /session does not match the expected schema${details ? ` (${details})` : ""}.`,
        response.status,
      );
    }
    return { session: result.data, status: response.status };
  }

  public async getHistoricalPositions(params: { deviceId: number; from: string; to: string }): Promise<JsonResponse<Position[]>> {
    return this.getJson("positions", positionsSchema, (query) => {
      query.set("deviceId", String(params.deviceId));
      query.set("from", params.from);
      query.set("to", params.to);
    });
  }

  public async getRouteReport(params: { deviceId: number; from: string; to: string }): Promise<JsonResponse<Position[]>> {
    return this.getJson("reports/route", positionsSchema, (query) => {
      query.set("deviceId", String(params.deviceId));
      query.set("from", params.from);
      query.set("to", params.to);
    });
  }

  public async getReportSummaryResponse(params: {
    deviceIds: readonly number[];
    from: string;
    to: string;
  }): Promise<JsonResponse<ReportSummary[]>> {
    return this.getJson("reports/summary", reportSummariesSchema, (query) => {
      for (const deviceId of params.deviceIds) query.append("deviceId", String(deviceId));
      query.set("from", params.from);
      query.set("to", params.to);
    });
  }

  public async getDevices(): Promise<Device[]> {
    const url = new URL("devices", this.config.baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: createJsonHeaders(this.config),
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        throw new EqugpsError("timeout", "eQuGPS request timed out.");
      }
      throw new EqugpsError("network", "Unable to reach eQuGPS. Check network access and EQUGPS_BASE_URL.");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw await createHttpError(response, "/devices");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new EqugpsError("invalid_json", "eQuGPS returned invalid JSON for /devices.");
    }

    const result = devicesSchema.safeParse(body);
    if (!result.success) {
      const details = formatValidationIssues(result.error, body);
      throw new EqugpsError(
        "invalid_response",
        `eQuGPS response for /devices does not match the expected schema${details ? ` (${details})` : ""}.`,
      );
    }

    return result.data;
  }

  public async getLatestPositions(): Promise<Position[]> {
    const url = new URL("positions", this.config.baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: createJsonHeaders(this.config),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new EqugpsError("timeout", "eQuGPS request timed out.");
      }
      throw new EqugpsError("network", "Unable to reach eQuGPS. Check network access and EQUGPS_BASE_URL.");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw await createHttpError(response, "/positions");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new EqugpsError("invalid_json", "eQuGPS returned invalid JSON for /positions.");
    }

    const result = positionsSchema.safeParse(body);
    if (!result.success) {
      const details = formatValidationIssues(result.error, body);
      throw new EqugpsError(
        "invalid_response",
        `eQuGPS response for /positions does not match the expected schema${details ? ` (${details})` : ""}.`,
      );
    }

    return result.data;
  }

  public async getReportSummary(params: {
    deviceIds: readonly number[];
    from: string;
    to: string;
  }): Promise<ReportSummary[]> {
    const url = new URL("reports/summary", this.config.baseUrl);
    for (const deviceId of params.deviceIds) {
      url.searchParams.append("deviceId", String(deviceId));
    }
    url.searchParams.set("from", params.from);
    url.searchParams.set("to", params.to);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: createJsonHeaders(this.config),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new EqugpsError("timeout", "eQuGPS request timed out.");
      }
      throw new EqugpsError("network", "Unable to reach eQuGPS. Check network access and EQUGPS_BASE_URL.");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw await createHttpError(response, "/reports/summary");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new EqugpsError("invalid_json", "eQuGPS returned invalid JSON for /reports/summary.");
    }

    const result = reportSummariesSchema.safeParse(body);
    if (!result.success) {
      const details = formatValidationIssues(result.error, body);
      throw new EqugpsError(
        "invalid_response",
        `eQuGPS response for /reports/summary does not match the expected schema${details ? ` (${details})` : ""}.`,
      );
    }

    return result.data;
  }
}
