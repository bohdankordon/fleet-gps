import { EquGpsConfigurationError, parseEquGpsConfig, type EquGpsConfig } from "@taxi-gps/equgps";

export type DatabaseConfig = Readonly<{
  url: string;
  poolMax: number;
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
}>;
export type SyncSchedulerConfig = Readonly<{
  enabled: boolean;
  fleetIntervalSeconds: number;
  runsIntervalSeconds: number;
  shutdownTimeoutMs: number;
}>;
export type AlertIngestionConfig = Readonly<{
  enabled: boolean;
}>;
export type TelegramNotificationsConfig = Readonly<{
  enabled: boolean;
  botToken: string | null;
  chatId: string | null;
  dispatchIntervalMs: number;
  batchSize: number;
}>;
export type ApiConfig = Readonly<{
  host: string;
  port: number;
  equGps: EquGpsConfig;
  database: DatabaseConfig;
  syncScheduler: SyncSchedulerConfig;
  alertIngestion: AlertIngestionConfig;
  telegramNotifications: TelegramNotificationsConfig;
}>;

export class ApiConfigurationError extends Error {
  public constructor(public readonly issues: readonly string[]) {
    super("Invalid API configuration.");
    this.name = "ApiConfigurationError";
  }
}

type Environment = Readonly<Record<string, string | undefined>>;

function parsePort(value: string | undefined): number | undefined {
  return parseInteger(value, 3_000, 1, 65_535);
}

function parseInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number | undefined {
  if (value === undefined || value === "") return fallback;
  if (!/^[0-9]+$/.test(value)) return undefined;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : undefined;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") return false;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

const equGpsIssueNames: Readonly<Record<string, string>> = Object.freeze({
  officialBaseUrl: "EQUGPS_BASE_URL",
  webBaseUrl: "EQUGPS_WEB_BASE_URL",
  email: "EQUGPS_EMAIL",
  password: "EQUGPS_PASSWORD",
  requestTimeoutMs: "EQUGPS_REQUEST_TIMEOUT_MS",
  runsRequestTimeoutMs: "EQUGPS_RUNS_TIMEOUT_MS",
});

export function parseApiConfig(env: Environment): ApiConfig {
  const host = (env.HOST ?? "127.0.0.1").trim();
  const port = parsePort(env.PORT);
  const databaseUrl = env.DATABASE_URL;
  const poolMax = parseInteger(env.DATABASE_POOL_MAX, 10, 1, 100);
  const connectionTimeoutMs = parseInteger(env.DATABASE_CONNECTION_TIMEOUT_MS, 5_000, 100, 120_000);
  const idleTimeoutMs = parseInteger(env.DATABASE_IDLE_TIMEOUT_MS, 30_000, 1_000, 600_000);
  const schedulerEnabled = parseBoolean(env.SYNC_SCHEDULER_ENABLED);
  const alertIngestionEnabled = parseBoolean(env.ALERT_INGESTION_ENABLED);
  const telegramNotificationsEnabled = parseBoolean(env.TELEGRAM_NOTIFICATIONS_ENABLED);
  const telegramBotToken = env.TELEGRAM_BOT_TOKEN?.trim() || null;
  const telegramChatId = env.TELEGRAM_CHAT_ID?.trim() || null;
  const telegramDispatchIntervalMs = parseInteger(env.TELEGRAM_NOTIFICATION_DISPATCH_INTERVAL_MS, 60_000, 1_000, 3_600_000);
  const telegramBatchSize = parseInteger(env.TELEGRAM_NOTIFICATION_BATCH_SIZE, 20, 1, 100);
  const fleetIntervalSeconds = parseInteger(env.FLEET_SYNC_INTERVAL_SECONDS, 60, 15, 3_600);
  const runsIntervalSeconds = parseInteger(env.RUNS_SYNC_INTERVAL_SECONDS, 300, 60, 3_600);
  const shutdownTimeoutMs = parseInteger(env.SYNC_SCHEDULER_SHUTDOWN_TIMEOUT_MS, 50_000, 1_000, 120_000);
  const issues: string[] = [];

  if (host.length === 0) issues.push("HOST");
  if (port === undefined) issues.push("PORT");
  if (typeof databaseUrl !== "string" || databaseUrl.trim() === "") issues.push("DATABASE_URL");
  if (poolMax === undefined) issues.push("DATABASE_POOL_MAX");
  if (connectionTimeoutMs === undefined) issues.push("DATABASE_CONNECTION_TIMEOUT_MS");
  if (idleTimeoutMs === undefined) issues.push("DATABASE_IDLE_TIMEOUT_MS");
  if (schedulerEnabled === undefined) issues.push("SYNC_SCHEDULER_ENABLED");
  if (alertIngestionEnabled === undefined) issues.push("ALERT_INGESTION_ENABLED");
  if (telegramNotificationsEnabled === undefined) issues.push("TELEGRAM_NOTIFICATIONS_ENABLED");
  if (telegramNotificationsEnabled === true && telegramBotToken === null) issues.push("TELEGRAM_BOT_TOKEN");
  if (telegramNotificationsEnabled === true && telegramChatId === null) issues.push("TELEGRAM_CHAT_ID");
  if (telegramDispatchIntervalMs === undefined) issues.push("TELEGRAM_NOTIFICATION_DISPATCH_INTERVAL_MS");
  if (telegramBatchSize === undefined) issues.push("TELEGRAM_NOTIFICATION_BATCH_SIZE");
  if (fleetIntervalSeconds === undefined) issues.push("FLEET_SYNC_INTERVAL_SECONDS");
  if (runsIntervalSeconds === undefined) issues.push("RUNS_SYNC_INTERVAL_SECONDS");
  if (shutdownTimeoutMs === undefined) issues.push("SYNC_SCHEDULER_SHUTDOWN_TIMEOUT_MS");

  if (
    issues.length > 0 ||
    port === undefined ||
    typeof databaseUrl !== "string" ||
    poolMax === undefined ||
    connectionTimeoutMs === undefined ||
    idleTimeoutMs === undefined ||
    schedulerEnabled === undefined ||
    alertIngestionEnabled === undefined ||
    telegramNotificationsEnabled === undefined ||
    telegramDispatchIntervalMs === undefined ||
    telegramBatchSize === undefined ||
    fleetIntervalSeconds === undefined ||
    runsIntervalSeconds === undefined ||
    shutdownTimeoutMs === undefined
  ) {
    throw new ApiConfigurationError(issues);
  }

  try {
    return Object.freeze({
      host,
      port,
      database: Object.freeze({ url: databaseUrl, poolMax, connectionTimeoutMs, idleTimeoutMs }),
      syncScheduler: Object.freeze({ enabled: schedulerEnabled, fleetIntervalSeconds, runsIntervalSeconds, shutdownTimeoutMs }),
      alertIngestion: Object.freeze({ enabled: alertIngestionEnabled }),
      telegramNotifications: Object.freeze({ enabled: telegramNotificationsEnabled, botToken: telegramBotToken, chatId: telegramChatId, dispatchIntervalMs: telegramDispatchIntervalMs, batchSize: telegramBatchSize }),
      equGps: Object.freeze(parseEquGpsConfig({
        officialBaseUrl: env.EQUGPS_BASE_URL ?? "",
        webBaseUrl: env.EQUGPS_WEB_BASE_URL ?? "",
        email: env.EQUGPS_EMAIL ?? "",
        password: env.EQUGPS_PASSWORD ?? "",
        requestTimeoutMs: env.EQUGPS_REQUEST_TIMEOUT_MS === undefined || env.EQUGPS_REQUEST_TIMEOUT_MS === "" ? 15_000 : Number(env.EQUGPS_REQUEST_TIMEOUT_MS),
        runsRequestTimeoutMs: env.EQUGPS_RUNS_TIMEOUT_MS === undefined || env.EQUGPS_RUNS_TIMEOUT_MS === "" ? 45_000 : Number(env.EQUGPS_RUNS_TIMEOUT_MS),
      })),
    });
  }
  catch (error) {
    if (error instanceof EquGpsConfigurationError) {
      const mapped = [...new Set(error.issues.map((issue) => equGpsIssueNames[issue.split(" ")[0] ?? ""]).filter((issue): issue is string => issue !== undefined))];
      throw new ApiConfigurationError(mapped);
    }
    throw new ApiConfigurationError([]);
  }
}
