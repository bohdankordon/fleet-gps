import { DISPLAY_LOCALES, DISPLAY_TIMEZONE, type AppLocale } from "./locales";

export function formatDateTime(locale: AppLocale, value: string | Date | null, options: Intl.DateTimeFormatOptions = {}): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(DISPLAY_LOCALES[locale], { dateStyle: "short", timeStyle: "short", ...options, timeZone: DISPLAY_TIMEZONE }).format(date);
  } catch {
    return null;
  }
}

export function formatNumber(locale: AppLocale, value: number, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(DISPLAY_LOCALES[locale], options).format(value);
}

const unitForms = Object.freeze({
  day: { ru: { one: "день", few: "дня", many: "дней", other: "дня" }, uk: { one: "день", few: "дні", many: "днів", other: "дня" }, en: { one: "day", other: "days" } },
  hour: { ru: { one: "час", few: "часа", many: "часов", other: "часа" }, uk: { one: "година", few: "години", many: "годин", other: "години" }, en: { one: "hour", other: "hours" } },
  minute: { ru: { one: "минута", few: "минуты", many: "минут", other: "минуты" }, uk: { one: "хвилина", few: "хвилини", many: "хвилин", other: "хвилини" }, en: { one: "minute", other: "minutes" } },
  second: { ru: { one: "секунда", few: "секунды", many: "секунд", other: "секунды" }, uk: { one: "секунда", few: "секунди", many: "секунд", other: "секунди" }, en: { one: "second", other: "seconds" } },
} as const);

export type DisplayUnit = keyof typeof unitForms;

export function formatUnit(locale: AppLocale, value: number, unit: DisplayUnit): string {
  const category = new Intl.PluralRules(DISPLAY_LOCALES[locale]).select(value);
  const forms = unitForms[unit][locale] as Readonly<Record<string, string>>;
  return `${formatNumber(locale, value)} ${forms[category] ?? forms.other}`;
}
