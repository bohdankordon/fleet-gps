"use client";

import { createContext, useContext, useMemo } from "react";
import { createTranslator, type Translator } from "./core";
import { DEFAULT_LOCALE, type AppLocale } from "./locales";

type I18nContextValue = Readonly<{ locale: AppLocale; t: Translator }>;
const defaultValue: I18nContextValue = Object.freeze({ locale: DEFAULT_LOCALE, t: createTranslator(DEFAULT_LOCALE) });
const I18nContext = createContext<I18nContextValue>(defaultValue);

export function I18nProvider({ locale, children }: Readonly<{ locale: AppLocale; children: React.ReactNode }>) {
  const value = useMemo<I18nContextValue>(() => ({ locale, t: createTranslator(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
