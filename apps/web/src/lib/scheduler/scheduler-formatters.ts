export const schedulerNoDataLabel = "Нет данных";

export function formatSchedulerTimestamp(value: string | null, timezone: string | null | undefined): string {
  if (!value || !timezone) return schedulerNoDataLabel;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return schedulerNoDataLabel;
    return new Intl.DateTimeFormat("ru-RU", { timeZone: timezone, dateStyle: "short", timeStyle: "medium" }).format(date);
  } catch { return schedulerNoDataLabel; }
}

export function formatSchedulerInterval(seconds: number): string {
  if (!Number.isInteger(seconds) || seconds < 0) return schedulerNoDataLabel;
  if (seconds === 60) return "1 мин";
  if (seconds === 300) return "5 мин";
  const minutes = Math.floor(seconds / 60); const remainder = seconds % 60;
  if (minutes > 0 && remainder > 0) return `${minutes} мин ${remainder} сек`;
  if (minutes > 0) return `${minutes} мин`;
  return `${seconds} сек`;
}

export function schedulerFailureCategoryLabel(value: "equgps" | "database" | "configuration" | "unknown" | null): string {
  return value === "equgps" ? "Сервис GPS" : value === "database" ? "База данных" : value === "configuration" ? "Конфигурация" : value === "unknown" ? "Неизвестная ошибка" : schedulerNoDataLabel;
}
