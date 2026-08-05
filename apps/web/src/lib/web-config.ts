export type WebConfig = Readonly<{ apiInternalBaseUrl: string }>;
export class WebConfigurationError extends Error { public constructor() { super("Invalid web configuration."); this.name = "WebConfigurationError"; } }

export function parseWebConfig(env: Readonly<Record<string, string | undefined>>): WebConfig {
  const value = env.API_INTERNAL_BASE_URL;
  if (typeof value !== "string" || value.trim() === "") throw new WebConfigurationError();
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new WebConfigurationError(); }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) throw new WebConfigurationError();
  return Object.freeze({ apiInternalBaseUrl: url.toString().replace(/\/+$/, "") });
}
