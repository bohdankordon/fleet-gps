import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

export class DeploymentConfigurationError extends Error {
  constructor(issues) {
    super("Invalid deployment configuration.");
    this.name = "DeploymentConfigurationError";
    this.issues = Object.freeze([...new Set(issues)].sort());
  }
}

function decodeUrlComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function pathTools(value) {
  return path.isAbsolute(value) ? path : null;
}

function isInsideOrEqual(candidate, parent, tools) {
  const relative = tools.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${tools.sep}`) && relative !== ".." && !tools.isAbsolute(relative));
}

function resolveThroughExistingAncestor(value, tools) {
  let cursor = value;
  const missingSegments = [];
  while (!existsSync(cursor)) {
    const parent = tools.dirname(cursor);
    if (parent === cursor) return value;
    missingSegments.unshift(tools.basename(cursor));
    cursor = parent;
  }
  return tools.resolve(realpathSync(cursor), ...missingSegments);
}

function backupPathIsSafe(value, repositoryRoot) {
  const tools = pathTools(value);
  if (tools === null) return false;

  const resolved = tools.resolve(value);
  const repositoryTools = pathTools(repositoryRoot);
  if (repositoryTools === tools && isInsideOrEqual(resolved, tools.resolve(repositoryRoot), tools)) return false;

  // If both paths exist, also reject a symlinked path that resolves into the
  // checkout. Lexical checking above still covers a not-yet-created path.
  if (existsSync(repositoryRoot)) {
    const realCandidate = resolveThroughExistingAncestor(resolved, tools);
    const realRepository = realpathSync(repositoryRoot);
    if (isInsideOrEqual(realCandidate, realRepository, path)) return false;
  }
  return true;
}

// Stage 23 operational-alert gate. OPS_ALERTS_ENABLED is independent from
// TELEGRAM_NOTIFICATIONS_ENABLED and strictly accepts only "true" or "false"
// when set. Missing/empty defaults to false (safe default). Any other nonempty
// value is malformed and must fail the preflight.
export function parseOpsAlertsEnabled(value) {
  if (value === undefined || value === "") return false;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parseRequiredBoolean(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function validAbsoluteInstant(value) {
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value) : null;
  if (!match) return false;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]); const hour = Number(match[4]); const minute = Number(match[5]); const second = Number(match[6]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  if (month < 1 || month > 12 || day < 1 || day > days || hour > 23 || minute > 59 || second > 59) return false;
  if (match[7] !== "Z") {
    const offsetHour = Number(match[9]); const offsetMinute = Number(match[10]);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return false;
  }
  return Number.isFinite(Date.parse(value));
}

function validOptionalDispatcherInteger(value) {
  return value === undefined || /^[0-9]+$/.test(value) && Number.isInteger(Number(value)) && Number(value) >= 1_000 && Number(value) <= 3_600_000;
}

function validOptionalDispatcherBatchSize(value) {
  return value === undefined || /^[0-9]+$/.test(value) && Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100;
}

export function validateDeploymentEnvironment(env, { repositoryRoot = process.cwd() } = {}) {
  const issues = [];
  const invalid = (...fields) => issues.push(...fields);

  const postgresUser = env.POSTGRES_USER ?? "";
  const postgresPassword = env.POSTGRES_PASSWORD ?? "";
  const postgresDatabase = env.POSTGRES_DB ?? "";
  const databaseUrl = env.DATABASE_URL ?? "";

  if (!/^[A-Za-z0-9_]+$/.test(postgresUser)) invalid("POSTGRES_USER");
  if (postgresPassword === "") invalid("POSTGRES_PASSWORD");
  if (!/^[A-Za-z0-9_]+$/.test(postgresDatabase)) invalid("POSTGRES_DB");

  let parsedDatabaseUrl;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    invalid("DATABASE_URL");
  }

  if (parsedDatabaseUrl !== undefined) {
    if (parsedDatabaseUrl.protocol !== "postgresql:" && parsedDatabaseUrl.protocol !== "postgres:") invalid("DATABASE_URL");
    if (parsedDatabaseUrl.hostname !== "postgres") invalid("DATABASE_URL");
    if (parsedDatabaseUrl.port !== "5432") invalid("DATABASE_URL");
    if (parsedDatabaseUrl.hash !== "") invalid("DATABASE_URL");

    const decodedUser = decodeUrlComponent(parsedDatabaseUrl.username);
    const decodedPassword = decodeUrlComponent(parsedDatabaseUrl.password);
    const decodedDatabase = decodeUrlComponent(parsedDatabaseUrl.pathname.slice(1));
    if (decodedUser === null || decodedUser !== postgresUser) invalid("DATABASE_URL", "POSTGRES_USER");
    if (decodedPassword === null || decodedPassword !== postgresPassword) invalid("DATABASE_URL", "POSTGRES_PASSWORD");
    if (decodedDatabase === null || decodedDatabase === "" || decodedDatabase.includes("/") || decodedDatabase !== postgresDatabase) invalid("DATABASE_URL", "POSTGRES_DB");
  }

  const siteAddress = env.SITE_ADDRESS ?? "";
  try {
    const siteUrl = new URL(siteAddress);
    if (
      siteUrl.protocol !== "https:" ||
      siteUrl.origin === "null" ||
      siteUrl.username !== "" ||
      siteUrl.password !== "" ||
      siteUrl.pathname !== "/" ||
      siteUrl.search !== "" ||
      siteUrl.hash !== ""
    ) invalid("SITE_ADDRESS");
  } catch {
    invalid("SITE_ADDRESS");
  }

  const imageTag = env.APP_IMAGE_TAG ?? "";
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(imageTag) || imageTag.toLowerCase() === "latest") invalid("APP_IMAGE_TAG");

  const backupDirectory = env.BACKUP_DIR ?? "";
  if (backupDirectory === "" || !backupPathIsSafe(backupDirectory, repositoryRoot)) invalid("BACKUP_DIR");

  for (const field of ["BACKUP_RETENTION_DAILY", "BACKUP_RETENTION_WEEKLY"]) {
    const value = env[field];
    if (value !== undefined && !/^[1-9][0-9]*$/.test(value)) invalid(field);
  }

  const opsAlertsEnabled = parseOpsAlertsEnabled(env.OPS_ALERTS_ENABLED);
  if (opsAlertsEnabled === undefined) invalid("OPS_ALERTS_ENABLED");
  if (opsAlertsEnabled === true) {
    if ((env.TELEGRAM_BOT_TOKEN ?? "").trim() === "") invalid("TELEGRAM_BOT_TOKEN");
    if ((env.TELEGRAM_CHAT_ID ?? "").trim() === "") invalid("TELEGRAM_CHAT_ID");
  }

  const telegramFlags = Object.fromEntries([
    "TELEGRAM_NOTIFICATIONS_ENABLED",
    "TELEGRAM_PRODUCT_LINKING_ENABLED",
    "TELEGRAM_PER_USER_NOTIFICATIONS_ENABLED",
    "TELEGRAM_PER_USER_DISPATCH_ENABLED",
  ].map((field) => [field, parseRequiredBoolean(env[field])]));
  for (const [field, value] of Object.entries(telegramFlags)) if (value === undefined) invalid(field);
  const legacyEnabled = telegramFlags.TELEGRAM_NOTIFICATIONS_ENABLED;
  const linkingEnabled = telegramFlags.TELEGRAM_PRODUCT_LINKING_ENABLED;
  const dispatchEnabled = telegramFlags.TELEGRAM_PER_USER_DISPATCH_ENABLED;
  if (legacyEnabled === true && dispatchEnabled === true) invalid("TELEGRAM_NOTIFICATIONS_ENABLED", "TELEGRAM_PER_USER_DISPATCH_ENABLED");
  if (linkingEnabled === true) {
    for (const field of ["TELEGRAM_PRODUCT_BOT_USERNAME", "TELEGRAM_PRODUCT_BOT_TOKEN", "TELEGRAM_PRODUCT_WEBHOOK_SECRET"]) if ((env[field] ?? "").trim() === "") invalid(field);
  }
  if (dispatchEnabled === true) {
    if ((env.TELEGRAM_PRODUCT_BOT_TOKEN ?? "").trim() === "") invalid("TELEGRAM_PRODUCT_BOT_TOKEN");
    if (!validAbsoluteInstant(env.TELEGRAM_PER_USER_DISPATCH_NOT_BEFORE)) invalid("TELEGRAM_PER_USER_DISPATCH_NOT_BEFORE");
  } else if (env.TELEGRAM_PER_USER_DISPATCH_NOT_BEFORE !== undefined && env.TELEGRAM_PER_USER_DISPATCH_NOT_BEFORE !== "" && !validAbsoluteInstant(env.TELEGRAM_PER_USER_DISPATCH_NOT_BEFORE)) {
    invalid("TELEGRAM_PER_USER_DISPATCH_NOT_BEFORE");
  }
  if (!validOptionalDispatcherInteger(env.TELEGRAM_PER_USER_DISPATCH_INTERVAL_MS)) invalid("TELEGRAM_PER_USER_DISPATCH_INTERVAL_MS");
  if (!validOptionalDispatcherBatchSize(env.TELEGRAM_PER_USER_DISPATCH_BATCH_SIZE)) invalid("TELEGRAM_PER_USER_DISPATCH_BATCH_SIZE");

  if (issues.length > 0) throw new DeploymentConfigurationError(issues);
  return Object.freeze({ valid: true });
}
