import { DateTime } from "luxon";
import { DISPLAY_LOCALES, type AppLocale } from "../../i18n/locales";

export function formatReportTimestamp(value: string | null, locale: AppLocale, timezone: string, options: Intl.DateTimeFormatOptions = {}): string {
  if (value === null) return "—";
  return new Intl.DateTimeFormat(DISPLAY_LOCALES[locale], { dateStyle: "short", timeStyle: "short", ...options, timeZone: timezone }).format(new Date(value));
}
export function formatReportDay(date: string, locale: AppLocale, timezone: string): string {
  return new Intl.DateTimeFormat(DISPLAY_LOCALES[locale], { day: "numeric", month: "long", year: "numeric", timeZone: timezone }).format(DateTime.fromISO(date, { zone: timezone }).toJSDate());
}
export function formatReportWindow(from: string, to: string, locale: AppLocale, timezone: string): string {
  const clock = (instant: string) => new Intl.DateTimeFormat(DISPLAY_LOCALES[locale], { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone }).format(new Date(instant));
  const sameDay = DateTime.fromISO(from).setZone(timezone).toISODate() === DateTime.fromISO(to).setZone(timezone).toISODate();
  const end = sameDay ? clock(to) : new Intl.DateTimeFormat(DISPLAY_LOCALES[locale], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone }).format(new Date(to));
  return `${clock(from)} → ${end}`;
}
