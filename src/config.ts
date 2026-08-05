import "dotenv/config";
import { z } from "zod";

const nonEmptyString = z.string().trim().min(1, "must be set");
const baseUrlSchema = nonEmptyString
  .url("must be a valid URL")
  .refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password;
  }, "must not include login or password")
  .transform((value) => `${value.replace(/\/+$/, "")}/`);

const configSchema = z.object({
  EQUGPS_BASE_URL: baseUrlSchema,
  EQUGPS_EMAIL: nonEmptyString.email("must be a valid email address"),
  EQUGPS_PASSWORD: nonEmptyString,
  EQUGPS_TIMEZONE: nonEmptyString.refine(
    (value) => {
      try {
        Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    "must be an IANA timezone, for example Europe/Warsaw",
  ),
  EQUGPS_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000),
});

export type EqugpsConfig = {
  baseUrl: string;
  email: string;
  password: string;
  timezone: string;
  requestTimeoutMs: number;
};

const webConfigSchema = z.object({
  EQUGPS_WEB_BASE_URL: baseUrlSchema,
  EQUGPS_WEB_TOKEN: nonEmptyString,
  EQUGPS_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000),
});

export type EqugpsWebConfig = {
  baseUrl: string;
  token: string;
  requestTimeoutMs: number;
};

export type EqugpsWebSessionProbeConfig = {
  baseUrl: string;
  configuredToken: string | undefined;
  requestTimeoutMs: number;
};

export class ConfigError extends Error {
  public constructor(messages: string[]) {
    super(`Invalid eQuGPS configuration: ${messages.join("; ")}`);
    this.name = "ConfigError";
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EqugpsConfig {
  const result = configSchema.safeParse(env);

  if (!result.success) {
    const messages = result.error.issues.map((issue) => {
      const key = issue.path.join(".") || "environment";
      const value = env[key];
      if (value === undefined || value.trim() === "") {
        return `${key} is required`;
      }
      return `${key} ${issue.message}`;
    });
    throw new ConfigError(messages);
  }

  return {
    baseUrl: result.data.EQUGPS_BASE_URL,
    email: result.data.EQUGPS_EMAIL,
    password: result.data.EQUGPS_PASSWORD,
    timezone: result.data.EQUGPS_TIMEZONE,
    requestTimeoutMs: result.data.EQUGPS_REQUEST_TIMEOUT_MS,
  };
}

export function loadWebConfig(env: NodeJS.ProcessEnv = process.env): EqugpsWebConfig {
  const result = webConfigSchema.safeParse(env);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => {
      const key = issue.path.join(".") || "environment";
      const value = env[key];
      return value === undefined || value.trim() === "" ? `${key} is required` : `${key} ${issue.message}`;
    });
    throw new ConfigError(messages);
  }
  return {
    baseUrl: result.data.EQUGPS_WEB_BASE_URL,
    token: result.data.EQUGPS_WEB_TOKEN,
    requestTimeoutMs: result.data.EQUGPS_REQUEST_TIMEOUT_MS,
  };
}

export function loadWebSessionProbeConfig(env: NodeJS.ProcessEnv = process.env): EqugpsWebSessionProbeConfig {
  const result = z.object({
    EQUGPS_WEB_BASE_URL: baseUrlSchema,
    EQUGPS_WEB_TOKEN: z.string().optional(),
    EQUGPS_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000),
  }).safeParse(env);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => {
      const key = issue.path.join(".") || "environment";
      const value = env[key];
      return value === undefined || value.trim() === "" ? `${key} is required` : `${key} ${issue.message}`;
    });
    throw new ConfigError(messages);
  }
  const configuredToken = result.data.EQUGPS_WEB_TOKEN?.trim();
  return {
    baseUrl: result.data.EQUGPS_WEB_BASE_URL,
    configuredToken: configuredToken === "" ? undefined : configuredToken,
    requestTimeoutMs: result.data.EQUGPS_REQUEST_TIMEOUT_MS,
  };
}
