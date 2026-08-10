export function formatFleetMapAge(observedAt: string, generatedAt: string): string {
  const observed = Date.parse(observedAt); const generated = Date.parse(generatedAt);
  if (!Number.isFinite(observed) || !Number.isFinite(generated) || observed > generated) return "время позиции уточняется";
  const seconds = Math.floor((generated - observed) / 1_000);
  if (seconds < 10) return "только что";
  if (seconds < 60) return `${seconds} сек назад`;
  const minutes = Math.floor(seconds / 60); if (minutes < 60) return `${minutes} мин назад`;
  return `${Math.floor(minutes / 60)} ч назад`;
}

export function formatFleetMapTimestamp(value: string): string {
  const date = new Date(value); if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Kyiv", dateStyle: "short", timeStyle: "medium" }).format(date);
}
