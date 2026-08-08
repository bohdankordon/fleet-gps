import { serializeAlertEventsFilters, type AlertEventsFilters } from "./alert-events-query";
export type AlertEventsNavigationReason = "user" | "popstate" | "refresh" | "retry";
export function shouldUpdateAlertEventsHistory(reason: AlertEventsNavigationReason): boolean { return reason === "user"; }
export function alertEventsHistoryPath(filters: AlertEventsFilters): string { const encoded = serializeAlertEventsFilters(filters); return encoded ? `/events?${encoded}` : "/events"; }
