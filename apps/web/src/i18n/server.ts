import "server-only";
import { cookies } from "next/headers";
import { createTranslator } from "./core";
import { LOCALE_COOKIE_NAME, resolveLocale } from "./locales";

export async function getServerLocale() {
  return resolveLocale((await cookies()).get(LOCALE_COOKIE_NAME)?.value);
}

export async function getServerI18n() {
  const locale = await getServerLocale();
  return Object.freeze({ locale, t: createTranslator(locale) });
}
