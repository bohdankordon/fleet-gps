import assert from "node:assert/strict";
import test from "node:test";
import { validateGeoJsonPolygon } from "../alert-settings/alert-settings.validation";
import { classifyPointInPolygon, POINT_ON_SEGMENT_EPSILON, validateGeoPoint } from "./city-geofence.geometry";

const square = () => validateGeoJsonPolygon({ type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] })!;
const concave = () => validateGeoJsonPolygon({ type: "Polygon", coordinates: [[[0, 0], [6, 0], [6, 6], [3, 3], [0, 6], [0, 0]]] })!;
const withHole = () => validateGeoJsonPolygon({ type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]]] })!;

test("strictly validates a GPS point without coercion", () => {
  assert.deepEqual(validateGeoPoint({ longitude: 28.4, latitude: 49.2 }), { longitude: 28.4, latitude: 49.2 });
  for (const input of [{ longitude: -181, latitude: 0 }, { longitude: 181, latitude: 0 }, { longitude: 0, latitude: -91 }, { longitude: 0, latitude: 91 }, { longitude: "0", latitude: 0 }, { longitude: Number.NaN, latitude: 0 }, { longitude: 0, latitude: Number.POSITIVE_INFINITY }, null, []]) assert.equal(validateGeoPoint(input), null);
});

test("classifies a simple Polygon including every edge and vertex", () => {
  const polygon = square();
  assert.equal(classifyPointInPolygon(polygon, { longitude: 5, latitude: 5 }), "INSIDE");
  assert.equal(classifyPointInPolygon(polygon, { longitude: 11, latitude: 5 }), "OUTSIDE");
  for (const point of [{ longitude: 5, latitude: 0 }, { longitude: 10, latitude: 5 }, { longitude: 5, latitude: 10 }, { longitude: 0, latitude: 5 }, { longitude: 0, latitude: 0 }, { longitude: 10, latitude: 0 }, { longitude: 10, latitude: 10 }, { longitude: 0, latitude: 10 }]) assert.equal(classifyPointInPolygon(polygon, point), "BOUNDARY");
});

test("handles concavity and Polygon holes deterministically", () => {
  assert.equal(classifyPointInPolygon(concave(), { longitude: 1, latitude: 1 }), "INSIDE");
  assert.equal(classifyPointInPolygon(concave(), { longitude: 3, latitude: 4.5 }), "OUTSIDE");
  const polygon = withHole();
  assert.equal(classifyPointInPolygon(polygon, { longitude: 1, latitude: 1 }), "INSIDE");
  assert.equal(classifyPointInPolygon(polygon, { longitude: 5, latitude: 5 }), "OUTSIDE");
  assert.equal(classifyPointInPolygon(polygon, { longitude: 3, latitude: 5 }), "BOUNDARY");
  assert.equal(classifyPointInPolygon(polygon, { longitude: 3, latitude: 3 }), "BOUNDARY");
});

test("uses epsilon only for floating-point boundary stability", () => {
  const polygon = square();
  assert.equal(classifyPointInPolygon(polygon, { longitude: 0, latitude: 5 }), "BOUNDARY");
  assert.equal(classifyPointInPolygon(polygon, { longitude: POINT_ON_SEGMENT_EPSILON * 2, latitude: 5 }), "INSIDE");
  assert.equal(classifyPointInPolygon(polygon, { longitude: -POINT_ON_SEGMENT_EPSILON * 2, latitude: 5 }), "OUTSIDE");
  assert.equal(classifyPointInPolygon(polygon, { longitude: -0.001, latitude: 5 }), "OUTSIDE");
  const shortSegmentPolygon = validateGeoJsonPolygon({ type: "Polygon", coordinates: [[[0, 0], [1e-15, 0], [1, 1], [0, 1], [0, 0]]] })!;
  assert.equal(classifyPointInPolygon(shortSegmentPolygon, { longitude: 5e-16, latitude: 0 }), "BOUNDARY");
  assert.equal(classifyPointInPolygon(shortSegmentPolygon, { longitude: 0.01, latitude: 0 }), "OUTSIDE");
  assert.equal(classifyPointInPolygon(square(), { longitude: -POINT_ON_SEGMENT_EPSILON / 2, latitude: 0 }), "BOUNDARY");
  assert.equal(classifyPointInPolygon(square(), { longitude: -POINT_ON_SEGMENT_EPSILON * 2, latitude: 0 }), "OUTSIDE");
});

test("treats null as unconfigured after point validation and never mutates inputs", () => {
  const polygon = square();
  const point = { longitude: 5, latitude: 5 };
  assert.equal(classifyPointInPolygon(null, point), "UNCONFIGURED");
  assert.equal(classifyPointInPolygon(null, { longitude: "5", latitude: 5 }), "INVALID_POINT");
  assert.equal(classifyPointInPolygon(polygon, point), "INSIDE");
  assert.deepEqual(point, { longitude: 5, latitude: 5 });
  assert.equal(polygon.coordinates[0]?.[0]?.[0], 0);
});
