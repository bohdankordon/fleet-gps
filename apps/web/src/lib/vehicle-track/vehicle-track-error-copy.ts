import type { VehicleTrackMode } from "./vehicle-track-range";
import type { VehicleTrackLoadError } from "./vehicle-track-request-state";
import { translate } from "../../i18n/core";
import { DEFAULT_LOCALE, type AppLocale } from "../../i18n/locales";

export function vehicleTrackResponseError(status: number, mode: VehicleTrackMode): Exclude<VehicleTrackLoadError, null> {
  if (status === 400) return "INVALID_RANGE";
  if (status === 404) return "NOT_FOUND";
  if (status === 422) return mode === "EXACT" ? "TOO_DENSE_EXACT" : "TOO_FRAGMENTED_OVERVIEW";
  if (status === 502) return "MALFORMED";
  return "UNAVAILABLE";
}

export function vehicleTrackErrorCopy(error: VehicleTrackLoadError, hasData: boolean, locale: AppLocale = DEFAULT_LOCALE): readonly [string, string] | null {
  if (!error) return null;
  if (error === "TOO_DENSE_EXACT") return [translate(locale, "track.error.tooDenseTitle"), translate(locale, hasData ? "track.error.chooseSmallerLastTrack" : "track.error.chooseSmaller")];
  if (error === "TOO_FRAGMENTED_OVERVIEW") return [translate(locale, "track.error.tooFragmentedTitle"), translate(locale, hasData ? "track.error.chooseSmallerLastData" : "track.error.chooseSmaller")];
  if (error === "INVALID_RANGE") return [translate(locale, "track.error.invalidTitle"), translate(locale, "track.error.invalidText")];
  if (error === "NOT_FOUND") return [translate(locale, "track.error.notFoundTitle"), translate(locale, "track.error.notFoundText")];
  if (error === "MALFORMED") return [translate(locale, "track.error.malformedTitle"), translate(locale, "track.error.malformedText")];
  return [translate(locale, "track.error.unavailableTitle"), translate(locale, hasData ? "track.error.lastData" : "track.error.retry")];
}
