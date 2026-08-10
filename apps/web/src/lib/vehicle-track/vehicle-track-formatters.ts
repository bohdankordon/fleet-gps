const kyivDateTime = new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", dateStyle: "medium", timeStyle: "medium" });
export function formatVehicleTrackTimestamp(value: string | null): string { if (value === null) return "—"; const date = new Date(value); return Number.isFinite(date.getTime()) ? kyivDateTime.format(date) : "—"; }
export function formatVehicleTrackSpeed(value: number | null): string { return value === null ? "Нет данных" : `${value.toFixed(1)} км/ч`; }
export function vehicleTrackQualityLabels(valid: boolean | null, outdated: boolean | null): readonly string[] {
  const labels: string[] = [];
  if (valid === false) labels.push("Provider отметил позицию как невалидную");
  if (outdated === true) labels.push("Provider отметил позицию как устаревшую");
  if (labels.length === 0 && valid === null && outdated === null) labels.push("Качество provider не указано");
  if (labels.length === 0) labels.push("Предупреждений качества нет");
  return labels;
}
