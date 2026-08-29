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
export type PositionHistoryMaintenanceConfig = Readonly<{
  enabled: boolean;
  windowBudget: number;
}>;
export type PositionHistoryRetentionConfig = Readonly<{
  enabled: boolean;
}>;
export type TelegramNotificationsConfig = Readonly<{
  enabled: boolean;
  botToken: string | null;
  chatId: string | null;
  dispatchIntervalMs: number;
  batchSize: number;
}>;
export type TelegramProductLinkingConfig = Readonly<{
  enabled: boolean;
  botUsername: string | null;
  botToken: string | null;
  webhookSecret: string | null;
}>;
export type TelegramPerUserNotificationsConfig = Readonly<{
  enabled: boolean;
}>;
export type TelegramPerUserDispatchConfig = Readonly<{
  enabled: boolean;
  dispatchIntervalMs: number;
  batchSize: number;
  dispatchNotBefore: Date | null;
}>;
export type ApiConfig = Readonly<{
  host: string;
  port: number;
  equGps: EquGpsConfig;
  database: DatabaseConfig;
  syncScheduler: SyncSchedulerConfig;
  alertIngestion: AlertIngestionConfig;
  positionHistoryMaintenance: PositionHistoryMaintenanceConfig;
  positionHistoryRetention?: PositionHistoryRetentionConfig;
  telegramNotifications: TelegramNotificationsConfig;
  telegramProductLinking?: TelegramProductLinkingConfig;
  telegramPerUserNotifications?: TelegramPerUserNotificationsConfig;
  telegramPerUserDispatch?: TelegramPerUserDispatchConfig;
}>;

export class ApiConfigurationError extends Error {
  public constructor(public readonly issues: readonly string[]) {
    super("Invalid API configuration.");
    this.name = "ApiConfigurationError";
  }
}

type Environment = Readonly<Record<string, string | undefined>>;

const OBVIOUS_PLACEHOLDERS = new Set(["change-me", "change-me-local", "changeme", "example", "password", "replace-me", "secret", "todo"]);

function obviousPlaceholder(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && OBVIOUS_PLACEHOLDERS.has(value.trim().toLowerCase());
}

function validDatabaseUrl(value: string | undefined, production: boolean): boolean {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== "postgresql:" && url.protocol !== "postgres:") || url.hostname === "" || url.pathname === "" || url.pathname === "/" || url.hash !== "") return false;
    if (production && (url.username === "" || url.password === "" || obviousPlaceholder(decodeURIComponent(url.username)) || obviousPlaceholder(decodeURIComponent(url.password)))) return false;
    return true;
  } catch { return false; }
}

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

function productBotUsername(value: string | undefined): string | null | undefined {
  if (value === undefined || value.trim() === "") return null;
  const normalized = value.trim().replace(/^@/, "");
  return /^[A-Za-z][A-Za-z0-9_]{4,31}bot$/i.test(normalized) ? normalized : undefined;
}

const absoluteInstantPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/;

function daysInMonth(year: number, month: number): number {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

function absoluteInstant(value: string | undefined): Date | null | undefined {
  if (value === undefined || value.trim() === "") return null;
  const normalized = value.trim();
  const match = absoluteInstantPattern.exec(normalized);
  if (!match) return undefined;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]); const hour = Number(match[4]); const minute = Number(match[5]); const second = Number(match[6]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) || hour > 23 || minute > 59 || second > 59) return undefined;
  if (match[7] !== "Z") {
    const offsetHour = Number(match[9]); const offsetMinute = Number(match[10]);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return undefined;
  }
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
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
  const production = env.NODE_ENV === "production";
  const nodeEnvironment = env.NODE_ENV;
  const host = (env.HOST ?? "127.0.0.1").trim();
  const port = parsePort(env.PORT);
  const databaseUrl = env.DATABASE_URL;
  const poolMax = parseInteger(env.DATABASE_POOL_MAX, 10, 1, 100);
  const connectionTimeoutMs = parseInteger(env.DATABASE_CONNECTION_TIMEOUT_MS, 5_000, 100, 120_000);
  const idleTimeoutMs = parseInteger(env.DATABASE_IDLE_TIMEOUT_MS, 30_000, 1_000, 600_000);
  const schedulerEnabled = parseBoolean(env.SYNC_SCHEDULER_ENABLED);
  const alertIngestionEnabled = parseBoolean(env.ALERT_INGESTION_ENABLED);
  const positionHistoryMaintenanceEnabled = parseBoolean(env.POSITION_HISTORY_MAINTENANCE_ENABLED);
  const positionHistoryMaintenanceWindowBudget = parseInteger(env.POSITION_HISTORY_MAINTENANCE_WINDOW_BUDGET, 5_000, 1, 5_000);
  const positionHistoryMaintenanceWindowBudgetExplicit = env.POSITION_HISTORY_MAINTENANCE_WINDOW_BUDGET !== undefined && env.POSITION_HISTORY_MAINTENANCE_WINDOW_BUDGET !== "";
  const positionHistoryRetentionEnabled = parseBoolean(env.POSITION_HISTORY_RETENTION_ENABLED);
  const telegramNotificationsEnabled = parseBoolean(env.TELEGRAM_NOTIFICATIONS_ENABLED);
  const telegramBotToken = env.TELEGRAM_BOT_TOKEN?.trim() || null;
  const telegramChatId = env.TELEGRAM_CHAT_ID?.trim() || null;
  const telegramDispatchIntervalMs = parseInteger(env.TELEGRAM_NOTIFICATION_DISPATCH_INTERVAL_MS, 60_000, 1_000, 3_600_000);
  const telegramBatchSize = parseInteger(env.TELEGRAM_NOTIFICATION_BATCH_SIZE, 20, 1, 100);
  const telegramProductLinkingEnabled = parseBoolean(env.TELEGRAM_PRODUCT_LINKING_ENABLED);
  const telegramPerUserNotificationsEnabled = parseBoolean(env.TELEGRAM_PER_USER_NOTIFICATIONS_ENABLED);
  const telegramPerUserDispatchEnabled = parseBoolean(env.TELEGRAM_PER_USER_DISPATCH_ENABLED);
  const telegramPerUserDispatchIntervalMs = parseInteger(env.TELEGRAM_PER_USER_DISPATCH_INTERVAL_MS, 60_000, 1_000, 3_600_000);
  const telegramPerUserDispatchBatchSize = parseInteger(env.TELEGRAM_PER_USER_DISPATCH_BATCH_SIZE, 20, 1, 100);
  const telegramPerUserDispatchNotBefore = absoluteInstant(env.TELEGRAM_PER_USER_DISPATCH_NOT_BEFORE);
  const telegramProductBotUsername = productBotUsername(env.TELEGRAM_PRODUCT_BOT_USERNAME);
  const telegramProductBotToken = env.TELEGRAM_PRODUCT_BOT_TOKEN?.trim() || null;
  const telegramProductWebhookSecret = env.TELEGRAM_PRODUCT_WEBHOOK_SECRET?.trim() || null;
  const fleetIntervalSeconds = parseInteger(env.FLEET_SYNC_INTERVAL_SECONDS, 60, 15, 3_600);
  const runsIntervalSeconds = parseInteger(env.RUNS_SYNC_INTERVAL_SECONDS, 300, 60, 3_600);
  const shutdownTimeoutMs = parseInteger(env.SYNC_SCHEDULER_SHUTDOWN_TIMEOUT_MS, 50_000, 1_000, 120_000);
  const issues: string[] = [];

  if (nodeEnvironment !== undefined && nodeEnvironment !== "" && nodeEnvironment !== "development" && nodeEnvironment !== "test" && nodeEnvironment !== "production") issues.push("NODE_ENV");
  if (host.length === 0) issues.push("HOST");
  if (port === undefined) issues.push("PORT");
  if (!validDatabaseUrl(databaseUrl, production)) issues.push("DATABASE_URL");
  if (poolMax === undefined) issues.push("DATABASE_POOL_MAX");
  if (connectionTimeoutMs === undefined) issues.push("DATABASE_CONNECTION_TIMEOUT_MS");
  if (idleTimeoutMs === undefined) issues.push("DATABASE_IDLE_TIMEOUT_MS");
  if (schedulerEnabled === undefined) issues.push("SYNC_SCHEDULER_ENABLED");
  if (alertIngestionEnabled === undefined) issues.push("ALERT_INGESTION_ENABLED");
  if (positionHistoryMaintenanceEnabled === undefined) issues.push("POSITION_HISTORY_MAINTENANCE_ENABLED");
  if (
    positionHistoryMaintenanceWindowBudget === undefined
    || (positionHistoryMaintenanceEnabled === true && !positionHistoryMaintenanceWindowBudgetExplicit)
  ) issues.push("POSITION_HISTORY_MAINTENANCE_WINDOW_BUDGET");
  if (positionHistoryRetentionEnabled === undefined) issues.push("POSITION_HISTORY_RETENTION_ENABLED");
  if (telegramNotificationsEnabled === undefined) issues.push("TELEGRAM_NOTIFICATIONS_ENABLED");
  if (telegramNotificationsEnabled === true && telegramBotToken === null) issues.push("TELEGRAM_BOT_TOKEN");
  if (telegramNotificationsEnabled === true && telegramChatId === null) issues.push("TELEGRAM_CHAT_ID");
  if (production && obviousPlaceholder(env.EQUGPS_PASSWORD)) issues.push("EQUGPS_PASSWORD");
  if (production && telegramNotificationsEnabled === true && obviousPlaceholder(telegramBotToken)) issues.push("TELEGRAM_BOT_TOKEN");
  if (production && telegramNotificationsEnabled === true && obviousPlaceholder(telegramChatId)) issues.push("TELEGRAM_CHAT_ID");
  if (telegramDispatchIntervalMs === undefined) issues.push("TELEGRAM_NOTIFICATION_DISPATCH_INTERVAL_MS");
  if (telegramBatchSize === undefined) issues.push("TELEGRAM_NOTIFICATION_BATCH_SIZE");
  if (telegramProductLinkingEnabled === undefined) issues.push("TELEGRAM_PRODUCT_LINKING_ENABLED");
  if (telegramPerUserNotificationsEnabled === undefined) issues.push("TELEGRAM_PER_USER_NOTIFICATIONS_ENABLED");
  if (telegramPerUserDispatchEnabled === undefined) issues.push("TELEGRAM_PER_USER_DISPATCH_ENABLED");
  if (telegramPerUserDispatchIntervalMs === undefined) issues.push("TELEGRAM_PER_USER_DISPATCH_INTERVAL_MS");
  if (telegramPerUserDispatchBatchSize === undefined) issues.push("TELEGRAM_PER_USER_DISPATCH_BATCH_SIZE");
  if (telegramPerUserDispatchEnabled === true && telegramProductBotToken === null) issues.push("TELEGRAM_PRODUCT_BOT_TOKEN");
  if (telegramPerUserDispatchNotBefore === undefined || (telegramPerUserDispatchEnabled === true && telegramPerUserDispatchNotBefore === null)) issues.push("TELEGRAM_PER_USER_DISPATCH_NOT_BEFORE");
  if (telegramNotificationsEnabled === true && telegramPerUserDispatchEnabled === true) issues.push("TELEGRAM_NOTIFICATIONS_ENABLED", "TELEGRAM_PER_USER_DISPATCH_ENABLED");
  if (production && telegramPerUserDispatchEnabled === true && obviousPlaceholder(telegramProductBotToken)) issues.push("TELEGRAM_PRODUCT_BOT_TOKEN");
  if (telegramProductBotUsername === undefined) issues.push("TELEGRAM_PRODUCT_BOT_USERNAME");
  if (telegramProductLinkingEnabled === true && telegramProductBotUsername === null) issues.push("TELEGRAM_PRODUCT_BOT_USERNAME");
  if (telegramProductLinkingEnabled === true && telegramProductBotToken === null) issues.push("TELEGRAM_PRODUCT_BOT_TOKEN");
  if (telegramProductLinkingEnabled === true && telegramProductWebhookSecret === null) issues.push("TELEGRAM_PRODUCT_WEBHOOK_SECRET");
  if (production && telegramProductLinkingEnabled === true && (obviousPlaceholder(telegramProductBotToken) || obviousPlaceholder(telegramProductWebhookSecret))) issues.push("TELEGRAM_PRODUCT_WEBHOOK_SECRET");
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
    positionHistoryMaintenanceEnabled === undefined ||
    positionHistoryMaintenanceWindowBudget === undefined ||
    positionHistoryRetentionEnabled === undefined ||
    telegramNotificationsEnabled === undefined ||
    telegramDispatchIntervalMs === undefined ||
    telegramBatchSize === undefined ||
    telegramProductLinkingEnabled === undefined ||
    telegramPerUserNotificationsEnabled === undefined ||
    telegramPerUserDispatchEnabled === undefined ||
    telegramPerUserDispatchIntervalMs === undefined ||
    telegramPerUserDispatchBatchSize === undefined ||
    telegramPerUserDispatchNotBefore === undefined ||
    telegramProductBotUsername === undefined ||
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
      database: Object.freeze({ url: databaseUrl.trim(), poolMax, connectionTimeoutMs, idleTimeoutMs }),
      syncScheduler: Object.freeze({ enabled: schedulerEnabled, fleetIntervalSeconds, runsIntervalSeconds, shutdownTimeoutMs }),
      alertIngestion: Object.freeze({ enabled: alertIngestionEnabled }),
      positionHistoryMaintenance: Object.freeze({ enabled: positionHistoryMaintenanceEnabled, windowBudget: positionHistoryMaintenanceWindowBudget }),
      positionHistoryRetention: Object.freeze({ enabled: positionHistoryRetentionEnabled }),
      telegramNotifications: Object.freeze({ enabled: telegramNotificationsEnabled, botToken: telegramBotToken, chatId: telegramChatId, dispatchIntervalMs: telegramDispatchIntervalMs, batchSize: telegramBatchSize }),
      telegramProductLinking: Object.freeze({ enabled: telegramProductLinkingEnabled, botUsername: telegramProductBotUsername, botToken: telegramProductBotToken, webhookSecret: telegramProductWebhookSecret }),
      telegramPerUserNotifications: Object.freeze({ enabled: telegramPerUserNotificationsEnabled }),
      telegramPerUserDispatch: Object.freeze({ enabled: telegramPerUserDispatchEnabled, dispatchIntervalMs: telegramPerUserDispatchIntervalMs, batchSize: telegramPerUserDispatchBatchSize, dispatchNotBefore: telegramPerUserDispatchNotBefore }),
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
