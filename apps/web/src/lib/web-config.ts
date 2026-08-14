export const PRODUCTION_MAP_ORIGIN = "https://tiles.openfreemap.org";
export type WebConfig = Readonly<{ apiInternalBaseUrl: string; mapStyleUrl: string | null }>;
export class WebConfigurationError extends Error {
  public readonly issues: readonly string[];
  public constructor(issues: readonly string[] = []) { super("Invalid web configuration."); this.name = "WebConfigurationError"; this.issues = issues; }
}

export function parseWebConfig(env: Readonly<Record<string, string | undefined>>): WebConfig {
  const value = env.API_INTERNAL_BASE_URL;
  if (typeof value !== "string" || value.trim() === "") throw new WebConfigurationError(["API_INTERNAL_BASE_URL"]);
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new WebConfigurationError(["API_INTERNAL_BASE_URL"]); }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) throw new WebConfigurationError(["API_INTERNAL_BASE_URL"]);
  const rawMapStyleUrl = env.NEXT_PUBLIC_MAP_STYLE_URL?.trim() ?? "";
  let mapStyleUrl: string | null = null;
  if (rawMapStyleUrl !== "") {
    try {
      const mapUrl = new URL(rawMapStyleUrl);
      if (mapUrl.protocol !== "https:" || mapUrl.origin !== PRODUCTION_MAP_ORIGIN || mapUrl.username || mapUrl.password || mapUrl.search || mapUrl.hash) throw new Error();
      mapStyleUrl = mapUrl.toString();
    } catch { throw new WebConfigurationError(["NEXT_PUBLIC_MAP_STYLE_URL"]); }
  }
  return Object.freeze({ apiInternalBaseUrl: url.toString().replace(/\/+$/, ""), mapStyleUrl });
}
