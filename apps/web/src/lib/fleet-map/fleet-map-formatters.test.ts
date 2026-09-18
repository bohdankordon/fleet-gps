import assert from "node:assert/strict";
import test from "node:test";
import { formatFleetMapAge, formatFleetMapTimestamp } from "./fleet-map-formatters";
test("formats snapshot-relative age without changing freshness and handles future safely", () => { assert.equal(formatFleetMapAge("2026-08-10T12:00:00.000Z", "2026-08-10T12:00:05.000Z", "ru"), "только что"); assert.equal(formatFleetMapAge("2026-08-10T12:00:00.000Z", "2026-08-10T12:00:35.000Z", "ru"), "35 сек назад"); assert.equal(formatFleetMapAge("2026-08-10T12:00:00.000Z", "2026-08-10T12:02:00.000Z", "ru"), "2 мин назад"); assert.equal(formatFleetMapAge("2026-08-10T12:01:00.000Z", "2026-08-10T12:00:00.000Z", "ru"), "время позиции уточняется"); });
test("formats Map timestamps in the accepted fixed application-timezone minute format", () => {
  for (const locale of ["ru", "uk", "en"] as const) assert.equal(formatFleetMapTimestamp("2026-08-21T15:48:00.000Z", locale), "2026-08-21, 18:48");
});
