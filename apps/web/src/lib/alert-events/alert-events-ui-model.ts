import type { AlertEventsListResponse } from "./alert-events-contract";
import { translate } from "../../i18n/core";
import { DEFAULT_LOCALE, type AppLocale } from "../../i18n/locales";
export function appendAlertEventsPage(current: AlertEventsListResponse, page: AlertEventsListResponse): AlertEventsListResponse { const known = new Set(current.items.map((item) => item.id)); return { items: [...current.items, ...page.items.filter((item) => !known.has(item.id))], nextCursor: page.nextCursor }; }
export function replaceAlertEventsPage(page: AlertEventsListResponse): AlertEventsListResponse { return { items: [...page.items], nextCursor: page.nextCursor }; }
export function emptyAlertEventsMessage(hasFilters: boolean, locale: AppLocale = DEFAULT_LOCALE): Readonly<{ heading: string; text: string }> { return hasFilters ? { heading: translate(locale, "events.empty.filteredTitle"), text: translate(locale, "events.empty.filteredText") } : { heading: translate(locale, "events.empty.title"), text: translate(locale, "events.empty.text") }; }
