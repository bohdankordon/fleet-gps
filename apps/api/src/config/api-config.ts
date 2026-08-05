import { parseEquGpsConfig, type EquGpsConfig } from "@taxi-gps/equgps";

export type ApiConfig = Readonly<{ host: string; port: number; equGps: EquGpsConfig }>;
export class ApiConfigurationError extends Error { public constructor(public readonly issues: readonly string[]) { super("Invalid API configuration."); this.name = "ApiConfigurationError"; } }
type Environment = Readonly<Record<string, string | undefined>>;
function parsePort(value: string | undefined): number | undefined { if (value === undefined || value === "") return 3_000; if (!/^[0-9]+$/.test(value)) return undefined; const parsed = Number(value); return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65_535 ? parsed : undefined; }
export function parseApiConfig(env: Environment): ApiConfig {
  const host = env.HOST ?? "127.0.0.1"; const port = parsePort(env.PORT); const issues: string[] = [];
  if (host.trim().length === 0) issues.push("HOST"); if (port === undefined) issues.push("PORT"); if (issues.length > 0 || port === undefined) throw new ApiConfigurationError(issues);
  try { return Object.freeze({ host, port, equGps: Object.freeze(parseEquGpsConfig({ officialBaseUrl: env.EQUGPS_BASE_URL ?? "", webBaseUrl: env.EQUGPS_WEB_BASE_URL ?? "", email: env.EQUGPS_EMAIL ?? "", password: env.EQUGPS_PASSWORD ?? "", requestTimeoutMs: env.EQUGPS_REQUEST_TIMEOUT_MS === undefined || env.EQUGPS_REQUEST_TIMEOUT_MS === "" ? 15_000 : Number(env.EQUGPS_REQUEST_TIMEOUT_MS) })) }); }
  catch { throw new ApiConfigurationError(["EQUGPS configuration"]); }
}
