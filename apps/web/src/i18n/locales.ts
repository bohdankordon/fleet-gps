export const SUPPORTED_LOCALES = Object.freeze(["ru", "uk", "en"] as const);
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "ru";
export const LOCALE_COOKIE_NAME = "taxi_locale";
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 31_536_000;
export const DISPLAY_TIMEZONE = "Europe/Kyiv";

export const DISPLAY_LOCALES: Readonly<Record<AppLocale, string>> = Object.freeze({
  ru: "ru-UA",
  uk: "uk-UA",
  en: "en-GB",
});

export const NATIVE_LOCALE_NAMES: Readonly<Record<AppLocale, string>> = Object.freeze({
  ru: "Русский",
  uk: "Українська",
  en: "English",
});

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && SUPPORTED_LOCALES.includes(value as AppLocale);
}

export function resolveLocale(value: unknown): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_LOCALE;
}

export function resolveLocaleFromCookieHeader(cookieHeader: string | null | undefined): AppLocale {
  if (!cookieHeader) return DEFAULT_LOCALE;
  const value = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE_NAME}=`))
    ?.slice(LOCALE_COOKIE_NAME.length + 1);
  return resolveLocale(value);
}
