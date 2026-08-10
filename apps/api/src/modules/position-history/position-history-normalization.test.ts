import assert from "node:assert/strict";
import test from "node:test";
import { PositionIngestionSource } from "../../generated/prisma/client";
import { normalizePositionHistoryCandidate } from "./position-history-normalization";

const observedAt = new Date("2026-08-10T10:15:30.123Z");
const fetchedAt = new Date("2026-08-10T10:16:00.000Z");

function candidate(overrides: Partial<Parameters<typeof normalizePositionHistoryCandidate>[0]> = {}) {
  return normalizePositionHistoryCandidate({
    observedAt,
    latitude: 49.2328,
    longitude: 28.481,
    speedKph: 18.52,
    valid: true,
    outdated: false,
    fetchedAt,
    ingestionSource: PositionIngestionSource.FLEET_SYNC,
    ...overrides,
  });
}

test("normalizes usable boundary coordinates and preserves provider quality flags", () => {
  for (const [latitude, longitude] of [[-90, -180], [-90, 180], [90, -180], [90, 180]] as const) {
    const value = candidate({ latitude, longitude, valid: false, outdated: true });
    assert.notEqual(value, null);
    assert.equal(value?.latitude, latitude);
    assert.equal(value?.longitude, longitude);
    assert.equal(value?.valid, false);
    assert.equal(value?.outdated, true);
  }
});

test("rejects missing, non-finite, and out-of-range coordinates without repair", () => {
  for (const latitude of [null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -90.0001, 90.0001]) {
    assert.equal(candidate({ latitude }), null);
  }
  for (const longitude of [null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -180.0001, 180.0001]) {
    assert.equal(candidate({ longitude }), null);
  }
});

test("requires a finite observedAt and preserves the shared fetchedAt", () => {
  assert.equal(candidate({ observedAt: null }), null);
  assert.equal(candidate({ observedAt: new Date("invalid") }), null);
  const value = candidate();
  assert.equal(value?.observedAt.toISOString(), observedAt.toISOString());
  assert.equal(value?.fetchedAt.toISOString(), fetchedAt.toISOString());
});

test("keeps valid speed and maps negative or non-finite speed to null", () => {
  assert.equal(candidate({ speedKph: 0 })?.speedKph, 0);
  assert.equal(candidate({ speedKph: 123.456 })?.speedKph, 123.456);
  for (const speedKph of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.equal(candidate({ speedKph })?.speedKph, null);
  }
});

test("fingerprint is source/fetch/quality independent and canonicalizes negative zero", () => {
  const fleet = candidate({ latitude: -0, longitude: -0, speedKph: -0 });
  const backfill = candidate({
    latitude: 0,
    longitude: 0,
    speedKph: 0,
    valid: false,
    outdated: true,
    fetchedAt: new Date("2026-08-11T00:00:00.000Z"),
    ingestionSource: PositionIngestionSource.HISTORICAL_BACKFILL,
  });
  assert.match(fleet?.fixFingerprint ?? "", /^[0-9a-f]{64}$/);
  assert.equal(fleet?.fixFingerprint, backfill?.fixFingerprint);
  assert.equal(Object.is(fleet?.latitude, -0), false);
});

test("same timestamp with a genuinely different normalized fix has a distinct identity", () => {
  const original = candidate();
  assert.equal(original?.fixFingerprint, "d27f79c2fc45293e0dc06cadd73cf952a6eec2b44f25caf90552d8161b34d76d");
  assert.notEqual(candidate({ latitude: 49.2329 })?.fixFingerprint, original?.fixFingerprint);
  assert.notEqual(candidate({ longitude: 28.4811 })?.fixFingerprint, original?.fixFingerprint);
  assert.notEqual(candidate({ speedKph: 18.53 })?.fixFingerprint, original?.fixFingerprint);
  assert.notEqual(candidate({ speedKph: null })?.fixFingerprint, candidate({ speedKph: 0 })?.fixFingerprint);
  assert.notEqual(candidate({ observedAt: new Date(observedAt.getTime() + 1) })?.fixFingerprint, original?.fixFingerprint);
});
