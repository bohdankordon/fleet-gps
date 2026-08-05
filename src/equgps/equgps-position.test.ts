import assert from "node:assert/strict";
import test from "node:test";
import { positionSchema } from "./equgps-position-schemas.js";
import { knotsToKmh } from "./equgps-speed.js";

test("converts zero knots to km/h", () => {
  assert.equal(knotsToKmh(0), 0);
});

test("converts one knot to km/h", () => {
  assert.equal(knotsToKmh(1), 1.852);
});

test("converts ten knots to km/h", () => {
  assert.equal(knotsToKmh(10), 18.52);
});

test("converts fractional knots to km/h", () => {
  assert.equal(knotsToKmh(1.5), 2.778);
});

test("rejects a negative speed", () => {
  assert.throws(() => knotsToKmh(-0.1), RangeError);
});

test("rejects a non-numeric speed in the position schema", () => {
  const result = positionSchema.safeParse({ deviceId: 1, speed: "12" });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.issues[0]?.code, "invalid_type");
  }
});

test("accepts a position with a transport date that is not strict ISO", () => {
  const result = positionSchema.safeParse({ deviceId: 1, fixTime: "2026-08-04T12:34:56.789+0000" });

  assert.equal(result.success, true);
});

test("accepts the confirmed object form of network", () => {
  const result = positionSchema.safeParse({ deviceId: 1, network: { type: "cell" } });

  assert.equal(result.success, true);
});
