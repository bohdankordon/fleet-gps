import type { AppLocale } from "../../i18n/locales";

export type AuthUnavailableCopy = Readonly<{ title: string; body: string; action: string }>;

const COPY: Readonly<Record<AppLocale, AuthUnavailableCopy>> = Object.freeze({
  en: Object.freeze({
    title: "Fleet GPS is temporarily unavailable",
    body: "We can’t verify access right now. Try again in a moment.",
    action: "Try again",
  }),
  uk: Object.freeze({
    title: "Fleet GPS тимчасово недоступний",
    body: "Зараз не вдається перевірити доступ. Спробуйте ще раз за мить.",
    action: "Спробувати ще раз",
  }),
  ru: Object.freeze({
    title: "Fleet GPS временно недоступен",
    body: "Сейчас не удаётся проверить доступ. Попробуйте ещё раз чуть позже.",
    action: "Попробовать снова",
  }),
});

export function unavailableCopy(locale: AppLocale): AuthUnavailableCopy {
  return COPY[locale];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
