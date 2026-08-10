import type { VehicleTrackMode } from "./vehicle-track-range";
import type { VehicleTrackLoadError } from "./vehicle-track-request-state";

export function vehicleTrackResponseError(status: number, mode: VehicleTrackMode): Exclude<VehicleTrackLoadError, null> {
  if (status === 400) return "INVALID_RANGE";
  if (status === 404) return "NOT_FOUND";
  if (status === 422) return mode === "EXACT" ? "TOO_DENSE_EXACT" : "TOO_FRAGMENTED_OVERVIEW";
  if (status === 502) return "MALFORMED";
  return "UNAVAILABLE";
}

export function vehicleTrackErrorCopy(error: VehicleTrackLoadError, hasData: boolean): readonly [string, string] | null {
  if (!error) return null;
  if (error === "TOO_DENSE_EXACT") return ["Слишком много точек для точного трека", hasData ? "Выберите меньший период. На карте показан последний успешно загруженный трек." : "Выберите меньший период."];
  if (error === "TOO_FRAGMENTED_OVERVIEW") return ["Слишком много отдельных участков для безопасного обзора", hasData ? "Выберите меньший период. На карте показаны последние успешно загруженные данные." : "Выберите меньший период."];
  if (error === "INVALID_RANGE") return ["Некорректный период", "Укажите обе абсолютные границы периода или выберите готовый интервал."];
  if (error === "NOT_FOUND") return ["Автомобиль не найден", "Проверьте ссылку или вернитесь к автопарку."];
  if (error === "MALFORMED") return ["Трек временно недоступен", "Сервер вернул некорректный формат данных."];
  return ["Не удалось загрузить трек", hasData ? "Показаны последние успешно полученные данные." : "Повторите попытку позже или выберите другой период."];
}
