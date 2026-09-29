const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Mirrors the Events investigation window around confirmation; the Trips page resolves the actual trip. */
export function speedingTripLink(origin: string, vehicleId: string, eventId: string, confirmedAt: Date, now: Date): string {
  if (!UUID.test(vehicleId) || !UUID.test(eventId) || !Number.isFinite(confirmedAt.getTime()) || !Number.isFinite(now.getTime())) throw new TypeError("Invalid speeding link input");
  const site = new URL(origin);
  if (site.protocol !== "https:" || site.origin !== origin || site.pathname !== "/" || site.username || site.password || site.search || site.hash) throw new TypeError("Invalid public site origin");
  const eventTime = confirmedAt.getTime();
  const from = new Date(eventTime - 30 * 60_000).toISOString();
  const to = new Date(Math.max(eventTime, Math.min(eventTime + 90 * 60_000, now.getTime()))).toISOString();
  const url = new URL(`/vehicles/${vehicleId}/trips`, site);
  url.search = new URLSearchParams({ from, to, event: eventId }).toString();
  return url.toString();
}
