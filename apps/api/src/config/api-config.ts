import { EquGpsConfigurationError, parseEquGpsConfig, type EquGpsConfig } from "@taxi-gps/equgps";

export type DatabaseConfig = Readonly<{ url: string; poolMax: number; connectionTimeoutMs: number; idleTimeoutMs: number }>;
export type ApiConfig = Readonly<{ host: string; port: number; equGps: EquGpsConfig; database: DatabaseConfig }>;
export class ApiConfigurationError extends Error { public constructor(public readonly issues: readonly string[]) { super("Invalid API configuration."); this.name = "ApiConfigurationError"; } }
type Environment = Readonly<Record<string, string | undefined>>;
function parsePort(value: string | undefined): number | undefined { if (value === undefined || value === "") return 3_000; if (!/^[0-9]+$/.test(value)) return undefined; const parsed = Number(value); return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65_535 ? parsed : undefined; }
function parseInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number | undefined { if (value === undefined || value === "") return fallback; if (!/^[0-9]+$/.test(value)) return undefined; const parsed = Number(value); return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : undefined; }
const equGpsIssueNames: Readonly<Record<string, string>> = Object.freeze({ officialBaseUrl: "EQUGPS_BASE_URL", webBaseUrl: "EQUGPS_WEB_BASE_URL", email: "EQUGPS_EMAIL", password: "EQUGPS_PASSWORD", requestTimeoutMs: "EQUGPS_REQUEST_TIMEOUT_MS" });

export function parseApiConfig(env: Environment): ApiConfig {
  const host = (env.HOST ?? "127.0.0.1").trim(); const port = parsePort(env.PORT); const databaseUrl = env.DATABASE_URL; const poolMax = parseInteger(env.DATABASE_POOL_MAX, 10, 1, 100); const connectionTimeoutMs = parseInteger(env.DATABASE_CONNECTION_TIMEOUT_MS, 5_000, 100, 120_000); const idleTimeoutMs = parseInteger(env.DATABASE_IDLE_TIMEOUT_MS, 30_000, 1_000, 600_000); const issues: string[] = [];
  if (host.trim().length === 0) issues.push("HOST"); if (port === undefined) issues.push("PORT"); if (typeof databaseUrl !== "string" || databaseUrl.trim() === "") issues.push("DATABASE_URL"); if (poolMax === undefined) issues.push("DATABASE_POOL_MAX"); if (connectionTimeoutMs === undefined) issues.push("DATABASE_CONNECTION_TIMEOUT_MS"); if (idleTimeoutMs === undefined) issues.push("DATABASE_IDLE_TIMEOUT_MS"); if (issues.length > 0 || port === undefined || typeof databaseUrl !== "string" || poolMax === undefined || connectionTimeoutMs === undefined || idleTimeoutMs === undefined) throw new ApiConfigurationError(issues);
  try { return Object.freeze({ host, port, database: Object.freeze({ url: databaseUrl, poolMax, connectionTimeoutMs, idleTimeoutMs }), equGps: Object.freeze(parseEquGpsConfig({ officialBaseUrl: env.EQUGPS_BASE_URL ?? "", webBaseUrl: env.EQUGPS_WEB_BASE_URL ?? "", email: env.EQUGPS_EMAIL ?? "", password: env.EQUGPS_PASSWORD ?? "", requestTimeoutMs: env.EQUGPS_REQUEST_TIMEOUT_MS === undefined || env.EQUGPS_REQUEST_TIMEOUT_MS === "" ? 15_000 : Number(env.EQUGPS_REQUEST_TIMEOUT_MS) })) }); }
  catch (error) {
    if (error instanceof EquGpsConfigurationError) {
      const mapped = [...new Set(error.issues.map((issue) => equGpsIssueNames[issue.split(" ")[0] ?? ""]).filter((issue): issue is string => issue !== undefined))];
      throw new ApiConfigurationError(mapped);
    }
    throw new ApiConfigurationError([]);
  }
}
