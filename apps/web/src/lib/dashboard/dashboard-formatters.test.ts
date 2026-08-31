import assert from "node:assert/strict";
import test from "node:test";
import { dashboardTimezone, formatDistance, formatFleetGpsTimestamp, formatFleetMetadataTimestamp, formatFleetServiceDate, formatGeneratedAt, formatSpeed, formatTimestamp, qualityLabel, sourceLabel, statusLabel } from "./dashboard-formatters";
test("uses the required dashboard timezone verbatim instead of a browser-owned default", () => { assert.equal(dashboardTimezone({ timezone: "Europe/Warsaw" }), "Europe/Warsaw"); });
test("formats distance, speed and null values without inventing zero", () => { assert.match(formatDistance(1250), /1[,.]3 км/); assert.equal(formatDistance(null), "Нет данных"); assert.equal(formatSpeed(null), "Нет данных"); assert.match(formatSpeed(42.5), /42[,.]5 км\/ч/); });
test("formats timestamps in requested timezone and labels known values", () => { assert.notEqual(formatTimestamp("2026-08-05T12:00:00.000Z", "Europe/Kyiv"), "Нет данных"); assert.equal(formatTimestamp(null, "Europe/Kyiv"), "Нет данных"); assert.equal(statusLabel("online"), "Онлайн"); assert.equal(sourceLabel("runs"), "Быстрые данные"); assert.equal(qualityLabel("exact"), "Точно"); });
test("formats generatedAt in the configured timezone and stays safe for invalid input", () => { assert.notEqual(formatGeneratedAt("2026-08-05T12:00:00.000Z", "Europe/Kyiv"), "Нет данных"); assert.equal(formatGeneratedAt("invalid", "Europe/Kyiv"), "Нет данных"); assert.equal(formatGeneratedAt("2026-08-05T12:00:00.000Z", "invalid"), "Нет данных"); });
test("Fleet metadata owns a fixed operational date format in the supplied application timezone", () => {
  for (const locale of ["ru", "uk", "en"] as const) assert.equal(formatFleetMetadataTimestamp("2026-08-05T12:00:00.000Z", "Europe/Kyiv", locale), "2026-08-05, 15:00");
  assert.equal(formatFleetServiceDate("2026-08-05"), "2026-08-05");
  assert.equal(formatFleetMetadataTimestamp("invalid", "Europe/Kyiv"), "Нет данных");
  assert.equal(formatFleetMetadataTimestamp("2026-08-05T12:00:00.000Z", "Europe/Warsaw"), "Нет данных");
});
test("Fleet GPS timestamps reuse the fixed operational minute format and leave absence to the cell", () => {
  for (const locale of ["ru", "uk", "en"] as const) assert.equal(formatFleetGpsTimestamp("2026-08-21T15:49:00.000Z", "Europe/Kyiv", locale), "2026-08-21, 18:49");
  assert.equal(formatFleetGpsTimestamp(null, "Europe/Kyiv", "uk"), null);
  assert.equal(formatFleetGpsTimestamp("invalid", "Europe/Kyiv", "uk"), null);
  assert.equal(formatFleetGpsTimestamp("2026-08-21T15:49:00.000Z", "Europe/Warsaw", "uk"), null);
});
