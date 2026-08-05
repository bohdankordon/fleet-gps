import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEqugpsDate } from "./equgps-date.js";
import { deviceSchema } from "./equgps-schemas.js";

test("accepts an ISO 8601 lastUpdate string with Z", () => {
  const result = deviceSchema.safeParse({ lastUpdate: "2026-08-04T12:34:56Z" });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.lastUpdate, "2026-08-04T12:34:56Z");
  }
});

test("recognizes an ISO 8601 lastUpdate with a timezone offset", () => {
  const normalized = normalizeEqugpsDate("2026-08-04T12:34:56+02:00");

  assert.equal(normalized.status, "recognized");
});

test("recognizes the eQuGPS offset format without a colon", () => {
  const normalized = normalizeEqugpsDate("2026-08-04T12:34:56.789+0000");

  assert.equal(normalized.status, "recognized");
});

test("recognizes an ISO 8601 local datetime without a timezone", () => {
  const normalized = normalizeEqugpsDate("2026-08-04T12:34:56");

  assert.equal(normalized.status, "recognized");
});

test("recognizes a local datetime with a space separator", () => {
  const normalized = normalizeEqugpsDate("2026-08-04 12:34:56");

  assert.equal(normalized.status, "recognized");
});

test("accepts and normalizes a null lastUpdate as missing", () => {
  const result = deviceSchema.safeParse({ lastUpdate: null });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.lastUpdate, null);
    assert.equal(normalizeEqugpsDate(result.data.lastUpdate).status, "missing");
  }
});

test("accepts and normalizes a missing lastUpdate", () => {
  const result = deviceSchema.safeParse({ id: 1 });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.lastUpdate, undefined);
    assert.equal(normalizeEqugpsDate(result.data.lastUpdate).status, "missing");
  }
});

test("returns unrecognized for an arbitrary date string", () => {
  const normalized = normalizeEqugpsDate("not-a-date");

  assert.equal(normalized.status, "unrecognized");
});

test("rejects an empty lastUpdate string", () => {
  const result = deviceSchema.safeParse({ lastUpdate: "" });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.issues[0]?.code, "custom");
  }
});
