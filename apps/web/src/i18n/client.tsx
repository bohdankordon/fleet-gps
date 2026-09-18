"use client";

import { createContext, useContext, useMemo } from "react";
import { createTranslator, type Translator } from "./core";
import { DEFAULT_LOCALE, type AppLocale, type LocalePreferenceMode } from "./locales";

type I18nContextValue = Readonly<{ locale: AppLocale; preferenceMode: LocalePreferenceMode; t: Translator }>;
const defaultValue: I18nContextValue = Object.freeze({ locale: DEFAULT_LOCALE, preferenceMode: "automatic", t: createTranslator(DEFAULT_LOCALE) });
const I18nContext = createContext<I18nContextValue>(defaultValue);

export function I18nProvider({ locale, preferenceMode = "explicit", children }: Readonly<{ locale: AppLocale; preferenceMode?: LocalePreferenceMode; children: React.ReactNode }>) {
  const value = useMemo<I18nContextValue>(() => ({ locale, preferenceMode, t: createTranslator(locale) }), [locale, preferenceMode]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
