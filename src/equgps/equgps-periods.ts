import { DateTime } from "luxon";

export const equgpsTimezone = "Europe/Kyiv";

export type ReportPeriod = {
  description: string;
  from: string;
  to: string;
};

function toApiIso(value: DateTime): string {
  // Whole-second ISO values are sufficient for report boundaries and accepted by
  // conservative server-side date parsers; zone conversion happens before this step.
  const iso = value.toUTC().set({ millisecond: 0 }).toISO({ suppressMilliseconds: true });
  if (iso === null) {
    throw new Error("Unable to build a valid API timestamp.");
  }
  return iso;
}

export function getCurrentKyivDay(now = DateTime.now().setZone(equgpsTimezone)): ReportPeriod {
  const localNow = now.setZone(equgpsTimezone);
  return {
    description: "Current calendar day (Europe/Kyiv)",
    from: toApiIso(localNow.startOf("day")),
    to: toApiIso(localNow),
  };
}

export function getPreviousKyivDay(now = DateTime.now().setZone(equgpsTimezone)): ReportPeriod {
  const currentDayStart = now.setZone(equgpsTimezone).startOf("day");
  return {
    description: "Previous calendar day (Europe/Kyiv)",
    from: toApiIso(currentDayStart.minus({ days: 1 })),
    to: toApiIso(currentDayStart),
  };
}

export function getPreviousKyivDayHour(now = DateTime.now().setZone(equgpsTimezone)): ReportPeriod {
  const previousDayStart = now.setZone(equgpsTimezone).startOf("day").minus({ days: 1 });
  return {
    description: "First hour of the previous calendar day (Europe/Kyiv)",
    from: toApiIso(previousDayStart),
    to: toApiIso(previousDayStart.plus({ hours: 1 })),
  };
}

export function getLastSevenFullKyivDays(now = DateTime.now().setZone(equgpsTimezone)): ReportPeriod {
  const currentDayStart = now.setZone(equgpsTimezone).startOf("day");
  return {
    description: "Last 7 full calendar days (Europe/Kyiv)",
    from: toApiIso(currentDayStart.minus({ days: 7 })),
    to: toApiIso(currentDayStart),
  };
}

export function createCustomPeriod(from: string, to: string): ReportPeriod {
  const fromDate = DateTime.fromISO(from, { setZone: true });
  const toDate = DateTime.fromISO(to, { setZone: true });
  if (!fromDate.isValid || !toDate.isValid || fromDate >= toDate) {
    throw new Error("Custom period must contain valid ISO timestamps where from is before to.");
  }

  return { description: "Custom period", from: toApiIso(fromDate), to: toApiIso(toDate) };
}
