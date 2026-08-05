import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeServerMessage } from "../equgps/equgps-errors.js";
import { compareDistances } from "./equgps-web-distance.js";
import { isAllowedWebPostEndpoint, serializeWebForm } from "./equgps-web-client.js";
import { normalizeMode1DataPositions, parseCoordinateTuple, parseOptionalNumericString, parseRequiredNumericString, unixSecondsToDate } from "./equgps-web-normalization.js";
import { mode1Schema, mode2Schema, webInfoResponseSchema, webRoutesSchema, webRunsSchema } from "./equgps-web-schemas.js";

test("serializes allowed form fields as application/x-www-form-urlencoded", () => {
  assert.equal(serializeWebForm({ mode: "mode1", id: "1", date: "2026-08-05" }), "mode=mode1&id=1&date=2026-08-05");
});

test("redacts a web token from safe errors", () => {
  const message = sanitizeServerMessage("token=secret-token-value-0123456789 deviceId=42");
  assert.doesNotMatch(message, /secret-token-value|42/);
});

test("allows only the three web POST endpoints", () => {
  assert.equal(isAllowedWebPostEndpoint("api/devices/runs"), true);
  assert.equal(isAllowedWebPostEndpoint("api/devices/info"), true);
  assert.equal(isAllowedWebPostEndpoint("api/devices/routes-new"), true);
  assert.equal(isAllowedWebPostEndpoint("api/devices/delete"), false);
});

test("validates runs, mode1 and mode2 transport shapes", () => {
  assert.equal(webRunsSchema.safeParse([{ id: 1, runDistance: 2 }]).success, true);
  assert.equal(mode1Schema.safeParse({ dataPositions: { startC: ["1", "2"], endC: ["3", "4"], maxSpeed: "10", lastTime: 1, distance: 1 }, dataGo: [{ startTime: 1, endTime: 2, maxSpeed: "10" }] }).success, true);
  assert.equal(mode2Schema.safeParse({ dataSpeed: [{ id: 1, deviceid: 2, speed: 1, lat: "1", lon: "2" }], maxRegSpeed: 60, stateMaxSpeed: 70 }).success, true);
});

test("accepts the confirmed opaque string form of top-level web attributes", () => {
  assert.equal(webInfoResponseSchema.safeParse([{ attributes: "opaque" }]).success, true);
  assert.equal(webInfoResponseSchema.safeParse([{ attributes: null }]).success, true);
  assert.equal(webInfoResponseSchema.safeParse([{}]).success, true);
});

test("rejects a non-numeric mode1 maxSpeed and accepts coordinate tuples", () => {
  assert.equal(mode1Schema.safeParse({ dataPositions: { maxSpeed: 10 } }).success, false);
  assert.deepEqual(parseCoordinateTuple(["50.1", "30.2"]), [50.1, 30.2]);
  assert.throws(() => parseCoordinateTuple(["not-a-number", "30.2"]));
  assert.throws(() => parseRequiredNumericString("not-a-number", "speed"));
});

test("normalizes optional numeric strings without inventing a zero", () => {
  assert.equal(parseOptionalNumericString("12.5"), 12.5);
  assert.equal(parseOptionalNumericString(" 12.5 "), 12.5);
  assert.equal(parseOptionalNumericString(""), null);
  assert.equal(parseOptionalNumericString("   "), null);
  assert.equal(parseOptionalNumericString(null), null);
  assert.equal(parseOptionalNumericString(undefined), null);
  assert.equal(parseOptionalNumericString("NaN"), null);
  assert.equal(parseOptionalNumericString("Infinity"), null);
  assert.equal(parseOptionalNumericString("12,5"), null);
  assert.equal(parseOptionalNumericString("not-a-number"), null);
  assert.throws(() => parseRequiredNumericString("", "speed"));
  assert.throws(() => parseRequiredNumericString("   ", "speed"));
});

test("mode1 normalizes despite an optional invalid maxSpeed but rejects invalid distance", () => {
  const parsed = mode1Schema.parse({ dataPositions: { distance: 10, maxSpeed: "not-a-number" } });
  const normalized = normalizeMode1DataPositions(parsed.dataPositions!);

  assert.equal(normalized.maxSpeedKnots, null);
  assert.equal(normalized.maxSpeedStatus, "unrecognized");
  assert.equal(mode1Schema.safeParse({ dataPositions: { distance: "not-a-number" } }).success, false);
});

test("converts Unix seconds rather than milliseconds", () => {
  assert.equal(unixSecondsToDate(1_700_000_000).getTime(), 1_700_000_000_000);
});

test("keeps mode2 speed as confirmed km/h", () => {
  const mode2 = mode2Schema.parse({ dataSpeed: [{ speed: 72 }] });
  assert.equal(mode2.dataSpeed?.[0]?.speed, 72);
});

test("validates a routes-new object with string-valued web position fields", () => {
  const result = webRoutesSchema.safeParse({ dataGo: [{ positions: [{ id: 1, deviceid: 2, latitude: "50", longitude: "30", speed: "12", attributes: "opaque", network: "opaque" }] }] });
  assert.equal(result.success, true);
});

test("compares distances without requiring identifiers", () => {
  assert.deepEqual(compareDistances(100, 90), { absoluteDifference: 10, percentageDifference: 10 });
  assert.deepEqual(compareDistances(undefined, 90), { absoluteDifference: undefined, percentageDifference: undefined });
});
