import assert from "node:assert/strict";
import test from "node:test";
import { vehicleTrackErrorCopy, vehicleTrackResponseError } from "./vehicle-track-error-copy";

test("maps 422 to mode-specific safe errors", () => {
  assert.equal(vehicleTrackResponseError(422, "EXACT"), "TOO_DENSE_EXACT");
  assert.equal(vehicleTrackResponseError(422, "OVERVIEW"), "TOO_FRAGMENTED_OVERVIEW");
  assert.deepEqual(vehicleTrackErrorCopy("TOO_DENSE_EXACT", false), ["Слишком много точек для точного трека", "Выберите меньший период."]);
  assert.deepEqual(vehicleTrackErrorCopy("TOO_FRAGMENTED_OVERVIEW", false), ["Слишком много отдельных участков для безопасного обзора", "Выберите меньший период."]);
});

test("last-good error copy describes displayed data separately", () => {
  assert.match(vehicleTrackErrorCopy("TOO_FRAGMENTED_OVERVIEW", true)?.[1] ?? "", /последние успешно загруженные данные/);
  assert.match(vehicleTrackErrorCopy("TOO_DENSE_EXACT", true)?.[1] ?? "", /последний успешно загруженный трек/);
});
