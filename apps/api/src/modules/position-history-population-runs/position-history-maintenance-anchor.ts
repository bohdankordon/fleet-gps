const TUESDAY_UTC_DAY = 2;
const ANCHOR_UTC_HOUR = 2;
const DAYS_PER_WEEK = 7;

export const POSITION_HISTORY_MAINTENANCE_ANCHOR_INTERVAL_MS = DAYS_PER_WEEK * 24 * 60 * 60 * 1_000;

export function canonicalPositionHistoryMaintenanceAnchor(instant: Date): Date {
  if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) throw new Error("Invalid position-history maintenance instant.");

  const anchor = new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate(), ANCHOR_UTC_HOUR));
  const daysSinceTuesday = (instant.getUTCDay() - TUESDAY_UTC_DAY + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  anchor.setUTCDate(anchor.getUTCDate() - daysSinceTuesday);
  if (anchor.getTime() > instant.getTime()) anchor.setUTCDate(anchor.getUTCDate() - DAYS_PER_WEEK);
  return anchor;
}
