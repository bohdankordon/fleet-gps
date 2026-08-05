import type { EqugpsWebConfig, EqugpsWebSessionProbeConfig } from "../config.js";
import { webInfoResponseSchema, webRoutesSchema, webRunsSchema, type WebInfo, type WebRoutes, type WebRun } from "./equgps-web-schemas.js";
import type { ZodType } from "zod";

const allowedPostEndpoints = new Set(["api/devices/runs", "api/devices/info", "api/devices/routes-new"]);
export type EqugpsWebError = Error & { status?: number | undefined; safeMessage?: string | undefined };
export type WebJsonResponse<T> = { data: T; responseSizeBytes: number; status: number };
type WebClientConfig = EqugpsWebConfig | EqugpsWebSessionProbeConfig;

export function isAllowedWebPostEndpoint(endpoint: string): boolean {
  return allowedPostEndpoints.has(endpoint.replace(/^\//, ""));
}

export function serializeWebForm(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

function createWebError(message: string, status?: number, safeMessage?: string): EqugpsWebError {
  const error = new Error(message) as EqugpsWebError;
  error.name = "EqugpsWebError";
  error.status = status;
  error.safeMessage = safeMessage;
  return error;
}

function valueAtPath(value: unknown, path: PropertyKey[]): unknown {
  let current = value;
  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === "number") current = current[segment];
    else if (current !== null && typeof current === "object" && segment in current) current = (current as Record<PropertyKey, unknown>)[segment];
    else return undefined;
  }
  return current;
}

function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export class EquGpsWebClient {
  public constructor(private readonly config: WebClientConfig) {}

  private async postJsonWithMetadata<T>(endpoint: string, schema: ZodType<T>, form?: Record<string, string>, tokenOverride?: string): Promise<WebJsonResponse<T>> {
    const normalizedEndpoint = endpoint.replace(/^\//, "");
    if (!isAllowedWebPostEndpoint(normalizedEndpoint)) throw createWebError("Web API POST endpoint is not allowlisted.");
    const url = new URL(normalizedEndpoint, this.config.baseUrl);
    const token = tokenOverride ?? ("token" in this.config ? this.config.token : undefined);
    if (token === undefined || token.trim() === "") throw createWebError("eQuGPS web API token is not configured.");
    url.searchParams.set("token", token);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: form === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        ...(form === undefined ? {} : { body: serializeWebForm(form) }),
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.text();
        throw createWebError(`eQuGPS web API request failed (HTTP ${response.status}).`, response.status);
      }
      const text = await response.text();
      let body: unknown;
      try { body = JSON.parse(text); } catch { throw createWebError("eQuGPS web API returned invalid JSON."); }
      const result = schema.safeParse(body);
      if (!result.success) {
        const details = result.error.issues.slice(0, 5).map((issue) => {
          const expected = "expected" in issue && typeof issue.expected === "string" ? issue.expected : "schema-compatible value";
          return `${issue.path.join(".")} [${issue.code}]: expected ${expected}; received ${valueType(valueAtPath(body, issue.path))}`;
        }).join(", ");
        throw createWebError(`eQuGPS web API response does not match the expected schema${details ? ` (${details})` : ""}.`);
      }
      return { data: result.data, responseSizeBytes: new TextEncoder().encode(text).length, status: response.status };
    } finally { clearTimeout(timer); }
  }

  private async postJson<T>(endpoint: string, schema: ZodType<T>, form?: Record<string, string>): Promise<T> {
    return (await this.postJsonWithMetadata(endpoint, schema, form)).data;
  }

  public getRuns(): Promise<WebRun[]> { return this.postJson("api/devices/runs", webRunsSchema); }
  public getRunsWithToken(token: string): Promise<WebJsonResponse<WebRun[]>> { return this.postJsonWithMetadata("api/devices/runs", webRunsSchema, undefined, token); }
  public getInfoMode1(id: number, date: string): Promise<WebInfo[]> { return this.postJson("api/devices/info", webInfoResponseSchema, { mode: "mode1", id: String(id), date }); }
  public getInfoMode2(id: number, date: string): Promise<WebInfo[]> { return this.postJson("api/devices/info", webInfoResponseSchema, { mode: "mode2", id: String(id), date }); }
  public getRoutesNew(id: number, date: string): Promise<WebRoutes> { return this.postJson("api/devices/routes-new", webRoutesSchema, { id: String(id), date }); }
  public getRoutesNewWithMetadata(id: number, date: string): Promise<WebJsonResponse<WebRoutes>> { return this.postJsonWithMetadata("api/devices/routes-new", webRoutesSchema, { id: String(id), date }); }
}
