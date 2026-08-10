export const DEFAULT_FLEET_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export function fleetMapStyleUrl(value: string | undefined = process.env.NEXT_PUBLIC_MAP_STYLE_URL): string {
  if (typeof value !== "string" || value.trim() === "") return DEFAULT_FLEET_MAP_STYLE_URL;
  try { const url = new URL(value.trim()); return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash ? url.toString() : DEFAULT_FLEET_MAP_STYLE_URL; }
  catch { return DEFAULT_FLEET_MAP_STYLE_URL; }
}
