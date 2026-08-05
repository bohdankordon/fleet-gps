import { z } from "zod";
import { EquGpsConfigurationError } from "../errors/equgps-errors";

const emailSchema = z.string().transform((value) => value.trim()).pipe(z.string().min(1));
const passwordSchema = z.string().refine((value) => /\S/.test(value), "must contain a non-whitespace character");
const httpsBaseUrl = z.string().transform((value) => value.trim()).pipe(z.string().min(1))
  .pipe(z.url())
  .superRefine((value, context) => {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") context.addIssue({ code: "custom", message: "must use HTTPS" });
    if (parsed.username !== "" || parsed.password !== "") context.addIssue({ code: "custom", message: "must not include credentials" });
    if (parsed.search !== "") context.addIssue({ code: "custom", message: "must not include a query string" });
    if (parsed.hash !== "") context.addIssue({ code: "custom", message: "must not include a fragment" });
  })
  .transform((value) => value.replace(/\/+$/, ""));

export const equGpsConfigSchema = z.object({
  officialBaseUrl: httpsBaseUrl,
  webBaseUrl: httpsBaseUrl,
  email: emailSchema,
  password: passwordSchema,
  requestTimeoutMs: z.number().int().min(1_000).max(120_000),
});

export type EquGpsConfigInput = z.input<typeof equGpsConfigSchema>;
export type EquGpsConfig = z.output<typeof equGpsConfigSchema>;

export type EquGpsSafeConfigSummary = {
  officialBaseUrl: string;
  webBaseUrl: string;
  requestTimeoutMs: number;
  hasEmail: boolean;
  hasPassword: boolean;
};

function safeIssuePath(path: PropertyKey[]): string {
  const field = path[0];
  return typeof field === "string" && ["officialBaseUrl", "webBaseUrl", "email", "password", "requestTimeoutMs"].includes(field)
    ? field
    : "configuration";
}

export function parseEquGpsConfig(input: EquGpsConfigInput): EquGpsConfig {
  const result = equGpsConfigSchema.safeParse(input);
  if (!result.success) {
    throw new EquGpsConfigurationError(result.error.issues.map((issue) => `${safeIssuePath(issue.path)} is invalid`));
  }
  return result.data;
}

export function safeConfigSummary(config: EquGpsConfig): EquGpsSafeConfigSummary {
  return {
    officialBaseUrl: config.officialBaseUrl,
    webBaseUrl: config.webBaseUrl,
    requestTimeoutMs: config.requestTimeoutMs,
    hasEmail: config.email.length > 0,
    hasPassword: config.password.length > 0,
  };
}
