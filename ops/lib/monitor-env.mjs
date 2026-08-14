// Explicit-env parsing and validation for the Stage 23 host monitor. Reuses the
// same node:util.parseEnv primitive as the Stage 22 preflight and the same
// strict OPS_ALERTS_ENABLED rule as the authoritative deployment config.

import { readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { parseOpsAlertsEnabled } from "./deployment-config.mjs";

export const DEFAULT_STATE_DIR = "/var/lib/taxi-gps/monitor";

export class MonitorConfigurationError extends Error {
  constructor(issues) {
    super("Invalid monitor configuration.");
    this.name = "MonitorConfigurationError";
    this.issues = Object.freeze([...new Set(issues)].sort());
  }
}

export function parseArguments(argv) {
  if (argv.length === 2 && argv[0] === "--env-file" && argv[1] !== "") return argv[1];
  if (argv.length === 1 && argv[0].startsWith("--env-file=") && argv[0].slice(11) !== "") return argv[0].slice(11);
  throw new Error("usage: node monitor-host.mjs --env-file .env.production");
}

// Only the explicitly selected production env file is configuration authority.
// Host process variables (PATH, Docker client context, and similar execution
// facts) must never silently become monitor/notifier configuration fallbacks.
export function loadEnvironment(envFile) {
  return parseEnv(readFileSync(envFile, "utf8"));
}

function collectOperationalAlertConfiguration(env, issues) {
  const alertsEnabled = parseOpsAlertsEnabled(env.OPS_ALERTS_ENABLED);
  if (alertsEnabled === undefined) issues.push("OPS_ALERTS_ENABLED");

  const botToken = (env.TELEGRAM_BOT_TOKEN ?? "").trim();
  const chatId = (env.TELEGRAM_CHAT_ID ?? "").trim();
  if (alertsEnabled === true && botToken === "") issues.push("TELEGRAM_BOT_TOKEN");
  if (alertsEnabled === true && chatId === "") issues.push("TELEGRAM_CHAT_ID");

  return {
    alertsEnabled: alertsEnabled === true,
    botToken: botToken === "" ? null : botToken,
    chatId: chatId === "" ? null : chatId,
  };
}

function collectSafeMessageFacts(env, issues) {
  const siteAddress = env.SITE_ADDRESS ?? "";
  let siteHostname = "";
  try {
    const siteUrl = new URL(siteAddress);
    if (
      siteUrl.protocol !== "https:" ||
      siteUrl.origin === "null" ||
      siteUrl.username !== "" ||
      siteUrl.password !== "" ||
      siteUrl.pathname !== "/" ||
      siteUrl.search !== "" ||
      siteUrl.hash !== "" ||
      siteUrl.hostname === ""
    ) {
      issues.push("SITE_ADDRESS");
    } else {
      siteHostname = siteUrl.hostname;
    }
  } catch {
    issues.push("SITE_ADDRESS");
  }

  const appImageTag = env.APP_IMAGE_TAG ?? "";
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(appImageTag) || appImageTag.toLowerCase() === "latest") {
    issues.push("APP_IMAGE_TAG");
  }
  return { siteAddress, siteHostname, appImageTag };
}

// Failure notifications intentionally validate only the facts required to
// contact Telegram. They must remain usable when SITE_ADDRESS, APP_IMAGE_TAG,
// BACKUP_DIR, Docker, or the application stack is the reason monitoring failed.
export function validateNotifierEnvironment(env) {
  const issues = [];
  const operational = collectOperationalAlertConfiguration(env, issues);
  if (issues.length > 0) throw new MonitorConfigurationError(issues);
  return Object.freeze(operational);
}

// The manual TEST message includes deployment identity facts, so it keeps the
// accepted SITE_ADDRESS and APP_IMAGE_TAG validation boundary.
export function validateTestNotificationEnvironment(env) {
  const issues = [];
  const operational = collectOperationalAlertConfiguration(env, issues);
  const messageFacts = collectSafeMessageFacts(env, issues);
  if (issues.length > 0) throw new MonitorConfigurationError(issues);
  return Object.freeze({ ...operational, ...messageFacts });
}

export function validateMonitorEnvironment(env, { stateDir = DEFAULT_STATE_DIR } = {}) {
  const issues = [];
  const invalid = (...fields) => issues.push(...fields);
  const operational = collectOperationalAlertConfiguration(env, issues);
  const messageFacts = collectSafeMessageFacts(env, issues);

  const backupDir = env.BACKUP_DIR ?? "";
  if (backupDir === "" || !path.isAbsolute(backupDir)) invalid("BACKUP_DIR");

  // Production always uses DEFAULT_STATE_DIR. The option is direct dependency
  // injection for tests only; environment variables never participate.
  if (typeof stateDir !== "string" || stateDir === "" || !path.isAbsolute(stateDir)) invalid("MONITOR_STATE_DIR");

  if (issues.length > 0) throw new MonitorConfigurationError(issues);

  return Object.freeze({
    ...operational,
    ...messageFacts,
    backupDir,
    stateDir,
  });
}
