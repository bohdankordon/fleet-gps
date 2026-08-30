"use client";

import { ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import ruRU from "antd/locale/ru_RU";
import ukUA from "antd/locale/uk_UA";
import type { AppLocale } from "@/i18n/locales";

const ANT_DESIGN_LOCALES = Object.freeze({ en: enUS, ru: ruRU, uk: ukUA });

/** Provides Ant Design context only; visual tokens intentionally remain stock. */
export function AntDesignProvider({ locale, children }: Readonly<{ locale: AppLocale; children: React.ReactNode }>) {
  return <ConfigProvider locale={ANT_DESIGN_LOCALES[locale]}>{children}</ConfigProvider>;
}
