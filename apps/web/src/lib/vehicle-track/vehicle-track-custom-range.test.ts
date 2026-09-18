import assert from "node:assert/strict";
import test from "node:test";
import { absoluteToKyivLocal, kyivLocalToAbsolute, parseVehicleTrackCustomRange, parseVehicleTrackCustomRangeToNow, vehicleTrackCustomRangeErrorCopy, vehicleTrackRangeToKyivDraft } from "./vehicle-track-custom-range";

test("formats absolute instants into Europe/Kyiv wall-clock minute inputs", () => {
  assert.equal(absoluteToKyivLocal("2026-01-10T06:30:00.000Z"), "2026-01-10T08:30");
  assert.equal(absoluteToKyivLocal("2026-08-10T05:30:00.000Z"), "2026-08-10T08:30");
  assert.equal(absoluteToKyivLocal("2026-01-01T22:30:00.000Z"), "2026-01-02T00:30");
  assert.deepEqual(vehicleTrackRangeToKyivDraft({ from: "2026-08-10T05:30:00.000Z", to: "2026-08-10T06:30:00.000Z" }), { from: "2026-08-10T08:30", to: "2026-08-10T09:30" });
});

test("converts normal Kyiv wall-clock timestamps to exact absolute instants", () => {
  assert.deepEqual(kyivLocalToAbsolute("2026-01-10T08:30"), { instant: "2026-01-10T06:30:00.000Z", error: null });
  assert.deepEqual(kyivLocalToAbsolute("2026-08-10T08:30"), { instant: "2026-08-10T05:30:00.000Z", error: null });
  assert.deepEqual(kyivLocalToAbsolute("2024-02-29T12:00"), { instant: "2024-02-29T10:00:00.000Z", error: null });
});

test("rejects invalid, nonexistent, and ambiguous Kyiv local timestamps", () => {
  assert.equal(kyivLocalToAbsolute("2026-02-30T12:00").error, "INVALID");
  assert.equal(kyivLocalToAbsolute("2026-03-29T03:30").error, "NONEXISTENT");
  assert.equal(kyivLocalToAbsolute("2026-10-25T03:30").error, "AMBIGUOUS");
});

test("enforces non-empty absolute elapsed ranges through custom inputs", () => {
  assert.deepEqual(parseVehicleTrackCustomRange({ from: "2026-08-10T08:00", to: "2026-08-11T08:00" }).range, { from: "2026-08-10T05:00:00.000Z", to: "2026-08-11T05:00:00.000Z" });
  assert.ok(parseVehicleTrackCustomRange({ from: "2026-03-29T01:00", to: "2026-03-30T01:00" }).range, "23 absolute hours across spring DST is allowed");
  assert.ok(parseVehicleTrackCustomRange({ from: "2026-10-25T01:00", to: "2026-10-26T01:00" }).range, "25 absolute hours across fall DST is an overview");
  assert.ok(parseVehicleTrackCustomRange({ from: "2026-08-01T08:00", to: "2026-08-08T08:00" }).range, "exactly seven absolute days is allowed");
  assert.equal(parseVehicleTrackCustomRange({ from: "2026-08-01T08:00", to: "2026-08-08T08:01" }).error, "TOO_LONG");
  assert.equal(parseVehicleTrackCustomRange({ from: "2026-08-10T08:00", to: "2026-08-10T08:00" }).error, "ORDER");
  assert.equal(parseVehicleTrackCustomRange({ from: "2026-08-10T09:00", to: "2026-08-10T08:00" }).error, "ORDER");
  assert.equal(vehicleTrackCustomRangeErrorCopy("TOO_LONG", "ru"), "Максимальный период — 7 дней.");
});

test("an empty custom end resolves to the supplied current instant without weakening Kyiv validation", () => {
  assert.deepEqual(parseVehicleTrackCustomRangeToNow({ from: "2026-08-10T08:00", to: "" }, new Date("2026-08-10T06:30:00.000Z")).range, {
    from: "2026-08-10T05:00:00.000Z",
    to: "2026-08-10T06:30:00.000Z",
  });
  assert.equal(parseVehicleTrackCustomRangeToNow({ from: "2026-03-29T03:30", to: "" }, new Date("2026-03-29T04:00:00.000Z")).error, "NONEXISTENT");
  assert.equal(parseVehicleTrackCustomRangeToNow({ from: "2026-10-25T03:30", to: "" }, new Date("2026-10-25T04:00:00.000Z")).error, "AMBIGUOUS");
  assert.equal(parseVehicleTrackCustomRangeToNow({ from: "2026-08-10T09:00", to: "" }, new Date("2026-08-10T05:00:00.000Z")).error, "ORDER");
  assert.equal(parseVehicleTrackCustomRangeToNow({ from: "2026-08-01T08:00", to: "" }, new Date("2026-08-08T05:01:00.000Z")).error, "TOO_LONG");
});
