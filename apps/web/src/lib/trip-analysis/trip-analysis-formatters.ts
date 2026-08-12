const dateTime = new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", dateStyle: "short", timeStyle: "short" });
export function formatTripAnalysisTime(value: string): string { return dateTime.format(new Date(value)); }
export function formatTripAnalysisDuration(seconds: number): string { if (seconds < 60) return `${Math.round(seconds)} с`; const minutes = Math.round(seconds / 60); if (minutes < 60) return `${minutes} мин`; const hours = Math.floor(minutes / 60); const rest = minutes % 60; return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`; }
export function formatObservedDistance(meters: number): string { return meters < 1_000 ? `${Math.round(meters)} м` : `${(meters / 1_000).toFixed(1)} км`; }

