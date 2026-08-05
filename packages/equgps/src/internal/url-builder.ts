const officialPaths = new Set(["session", "devices", "positions"]);

function appendPath(baseUrl: string, path: string): URL {
  if (!officialPaths.has(path)) throw new Error("Unsupported official eQuGPS path.");
  return new URL(path, `${baseUrl}/`);
}

export type UrlQuery = Readonly<Record<string, string>> | readonly (readonly [string, string])[];

export function buildOfficialUrl(baseUrl: string, path: "session" | "devices" | "positions", query?: UrlQuery): string {
  const url = appendPath(baseUrl, path);
  if (query !== undefined) {
    const entries = Array.isArray(query) ? query : Object.entries(query);
    for (const [key, value] of entries) url.searchParams.append(key, value);
  }
  return url.toString();
}

export function buildWebRunsUrl(baseUrl: string, token: string): string {
  const url = new URL("api/devices/runs", `${baseUrl}/`);
  url.searchParams.append("token", token);
  return url.toString();
}
