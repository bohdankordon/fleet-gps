import assert from "node:assert/strict";
import test from "node:test";
import { PositionIngestionSource } from "../../generated/prisma/client";
import { mapEquGpsPositionToHistoryInput, parseEquGpsPositionTime } from "./equgps-position-history-normalization";
import { normalizePositionHistoryCandidate } from "./position-history-normalization";

const fetchedAt = new Date("2026-08-10T12:30:00.000Z");
const base = { deviceId: 1, fixTime: "2026-08-10T12:19:21.123Z", valid: false, outdated: true, speedKnots: 10, latitude: 49.2, longitude: 28.4 } as const;

test("maps provider time, knot speed, coordinates, and quality through the shared history normalizer", () => {
  const input = mapEquGpsPositionToHistoryInput(base, fetchedAt);
  const candidate = normalizePositionHistoryCandidate({ ...input, ingestionSource: PositionIngestionSource.HISTORICAL_BACKFILL });
  assert.equal(candidate?.observedAt.toISOString(), base.fixTime);
  assert.equal(candidate?.speedKph, 18.52);
  assert.equal(candidate?.valid, false);
  assert.equal(candidate?.outdated, true);
  assert.equal(candidate?.fetchedAt.toISOString(), fetchedAt.toISOString());
});

test("accepts WGS84 boundaries and skips structurally invalid coordinates", () => {
  for (const [latitude, longitude] of [[-90, -180], [-90, 180], [90, -180], [90, 180]] as const) {
    const input = mapEquGpsPositionToHistoryInput({ ...base, latitude, longitude }, fetchedAt);
    assert.notEqual(normalizePositionHistoryCandidate({ ...input, ingestionSource: PositionIngestionSource.HISTORICAL_BACKFILL }), null);
  }
  for (const overrides of [{ latitude: 90.1 }, { longitude: 180.1 }, { latitude: Number.NaN }, { longitude: Number.POSITIVE_INFINITY }, { latitude: null }, { longitude: null }]) {
    const input = mapEquGpsPositionToHistoryInput({ ...base, ...overrides }, fetchedAt);
    assert.equal(normalizePositionHistoryCandidate({ ...input, ingestionSource: PositionIngestionSource.HISTORICAL_BACKFILL }), null);
  }
});

test("normalizes invalid provider speed to null without dropping an otherwise usable fix", () => {
  for (const speedKnots of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, null]) {
    const input = mapEquGpsPositionToHistoryInput({ ...base, speedKnots }, fetchedAt);
    assert.equal(normalizePositionHistoryCandidate({ ...input, ingestionSource: PositionIngestionSource.HISTORICAL_BACKFILL })?.speedKph, null);
  }
});

test("missing or malformed observedAt yields no history candidate while explicit offsets are absolute", () => {
  for (const fixTime of [null, "invalid", "2026-08-10T12:19:21", "2026-02-30T00:00:00Z"]) {
    const input = mapEquGpsPositionToHistoryInput({ ...base, fixTime }, fetchedAt);
    assert.equal(normalizePositionHistoryCandidate({ ...input, ingestionSource: PositionIngestionSource.HISTORICAL_BACKFILL }), null);
  }
  assert.equal(parseEquGpsPositionTime("2026-08-10T14:19:21.123+02:00").value?.toISOString(), base.fixTime);
});
