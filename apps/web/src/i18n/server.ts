import "server-only";
import { cookies, headers } from "next/headers";
import { createTranslator } from "./core";
import { LOCALE_COOKIE_NAME, resolveLocalePreference } from "./locales";

export async function getServerLocaleResolution() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveLocalePreference(cookieStore.get(LOCALE_COOKIE_NAME)?.value, headerStore.get("accept-language"));
}

export async function getServerLocale() {
  return (await getServerLocaleResolution()).locale;
}

export async function getServerI18n() {
  const resolution = await getServerLocaleResolution();
  return Object.freeze({ ...resolution, t: createTranslator(resolution.locale) });
}
