import { DEFAULT_LOCALE, type AppLocale } from "./locales";
import { MESSAGES, type MessageKey, type MessageParameters } from "./messages";

const placeholderPattern = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

export function translate(locale: AppLocale, key: MessageKey, parameters: MessageParameters = {}): string {
  const template = MESSAGES[locale]?.[key] ?? MESSAGES[DEFAULT_LOCALE][key];
  return template.replace(placeholderPattern, (placeholder, name: string) => name in parameters ? String(parameters[name]) : placeholder);
}

export type Translator = (key: MessageKey, parameters?: MessageParameters) => string;

export function createTranslator(locale: AppLocale): Translator {
  return (key, parameters) => translate(locale, key, parameters);
}

export function messagePlaceholders(message: string): readonly string[] {
  return Object.freeze([...message.matchAll(placeholderPattern)].map((match) => match[1]!).sort());
}
