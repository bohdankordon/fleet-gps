import assert from "node:assert/strict";
import test from "node:test";
import { buildVehicleTrackPresentation } from "../vehicle-track/vehicle-track-presentation";
import type { VehicleTrackResponse } from "../vehicle-track/vehicle-track-contract";
import type { SpeedingEventInvestigation } from "../alert-events/alert-events-contract";
import type { TripAnalysisTrip } from "./trip-analysis-contract";
import { buildSpeedingSegmentGeoJson } from "./trip-analysis-speeding-route";

const BASE = Date.parse("2026-09-16T10:00:00.000Z");
const iso = (seconds: number) => new Date(BASE + seconds * 1_000).toISOString();
const position = (seconds: number, latitude = 49 + seconds / 10_000, longitude = 28 + seconds / 10_000) => ({ latitude, longitude, observedAt: iso(seconds) });

function trip(start = 0, end = 900): TripAnalysisTrip {
  return { startAt: iso(start), endAt: iso(end), durationSeconds: end - start, observedDistanceMeters: 1_000, startPosition: position(start), endPosition: position(end), observationCount: 2, terminationReason: "STOP", endClipped: false };
}

function track(...seconds: number[]) {
  const points = seconds.map((second) => ({ ...position(second), speedKph: 70, valid: true, outdated: false }));
  const response: VehicleTrackResponse = { generatedAt: iso(1_000), vehicle: { id: "00000000-0000-4000-8000-000000000001", name: "Vehicle", group: null }, range: { from: iso(0), to: iso(1_000) }, summary: { pointCount: points.length, firstObservedAt: points[0]?.observedAt ?? null, lastObservedAt: points.at(-1)?.observedAt ?? null }, points };
  return buildVehicleTrackPresentation(response);
}

function segment(start: number, confirmed: number, end: number, overrides: Partial<SpeedingEventInvestigation["speedingSegments"][number]> = {}): SpeedingEventInvestigation["speedingSegments"][number] {
  return { startedAt: iso(start), startPosition: { latitude: 49.5, longitude: 28.5 }, confirmedAt: iso(confirmed), lastSpeedingObservedAt: iso(end), lastSpeedingPosition: { latitude: 49.6, longitude: 28.6 }, ...overrides };
}

test("builds one authoritative segment, deduplicates boundary timestamps, and uses exact boundary coordinates", () => {
  const result = buildSpeedingSegmentGeoJson([segment(0, 10, 30)], trip(), track(0, 10, 20, 30));
  assert.equal(result.hasEvidence, true); assert.equal(result.hasDrawableGeometry, true); assert.equal(result.partial, false);
  assert.deepEqual(result.geoJson.features[0]?.geometry.coordinates, [[28.5, 49.5], [28.001, 49.001], [28.002, 49.002], [28.6, 49.6]]);
});

test("supports multiple confirmed streaks without joining them", () => {
  const result = buildSpeedingSegmentGeoJson([segment(0, 10, 30), segment(60, 70, 90)], trip(), track(0, 10, 30, 60, 70, 90));
  assert.equal(result.geoJson.features.length, 2);
  assert.deepEqual(result.geoJson.features.map((feature) => feature.properties.segmentIndex), [0, 1]);
});

test("splits on the established connected-gap threshold and never bridges missing route history", () => {
  const result = buildSpeedingSegmentGeoJson([segment(0, 10, 700)], trip(0, 900), track(0, 100, 600, 700));
  assert.equal(result.geoJson.features.length, 2);
  assert.equal(result.partial, true);
  for (const feature of result.geoJson.features) assert.equal(feature.geometry.coordinates.length, 2);
});

test("keeps an exact 300-second route gap connected and splits at 301 seconds", () => {
  const connected = buildSpeedingSegmentGeoJson([segment(0, 0, 300)], trip(), track(0, 300));
  assert.equal(connected.geoJson.features.length, 1); assert.equal(connected.partial, false);
  const split = buildSpeedingSegmentGeoJson([segment(0, 0, 301)], trip(), track(0, 301));
  assert.equal(split.geoJson.features.length, 0); assert.equal(split.partial, true);
});

test("boundary-only evidence remains durable but does not invent a straight route", () => {
  const result = buildSpeedingSegmentGeoJson([segment(0, 10, 30)], trip(), track());
  assert.deepEqual(result.geoJson.features, []); assert.equal(result.hasEvidence, true); assert.equal(result.hasDrawableGeometry, false); assert.equal(result.partial, true);
});

test("clips to the confirmation-containing trip and marks retained geometry partial", () => {
  const result = buildSpeedingSegmentGeoJson([segment(-60, 10, 60)], trip(0, 30), track(0, 10, 20, 30, 60));
  assert.equal(result.hasDrawableGeometry, true); assert.equal(result.partial, true);
  const coordinates = result.geoJson.features.flatMap((feature) => feature.geometry.coordinates);
  assert.equal(coordinates.some((coordinate) => coordinate[0] === 28.006), false);
});

test("legacy no-evidence events produce no overlay or partial warning", () => {
  assert.deepEqual(buildSpeedingSegmentGeoJson([], trip(), track(0, 10)), { geoJson: { type: "FeatureCollection", features: [] }, hasEvidence: false, hasDrawableGeometry: false, partial: false });
});
