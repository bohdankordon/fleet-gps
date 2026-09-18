export const SUPPORTED_LOCALES = Object.freeze(["ru", "uk", "en"] as const);
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "uk";
export const LOCALE_COOKIE_NAME = "taxi_locale";
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 31_536_000;
export const DISPLAY_TIMEZONE = "Europe/Kyiv";
export type LocalePreferenceMode = "explicit" | "automatic";
export type LocaleResolution = Readonly<{ locale: AppLocale; preferenceMode: LocalePreferenceMode }>;

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

function primaryLanguageRange(acceptLanguage: string | null | undefined): string | null {
  if (typeof acceptLanguage !== "string") return null;
  const primary = acceptLanguage.split(",", 1)[0]?.trim();
  if (!primary) return null;
  const [range, ...parameters] = primary.split(";").map((part) => part.trim());
  if (!range || range === "*" || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(range)) return null;
  if (parameters.some((parameter) => !/^q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/i.test(parameter))) return null;
  return range;
}

export function resolvePrimaryBrowserLocale(acceptLanguage: string | null | undefined): AppLocale {
  const language = primaryLanguageRange(acceptLanguage)?.split("-", 1)[0]?.toLowerCase();
  return language === "uk" || language === "ru" || language === "en" ? language : DEFAULT_LOCALE;
}

export function resolveLocalePreference(explicitPreference: unknown, acceptLanguage: string | null | undefined): LocaleResolution {
  return isAppLocale(explicitPreference)
    ? Object.freeze({ locale: explicitPreference, preferenceMode: "explicit" })
    : Object.freeze({ locale: resolvePrimaryBrowserLocale(acceptLanguage), preferenceMode: "automatic" });
}
