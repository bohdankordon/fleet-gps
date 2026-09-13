import assert from "node:assert/strict";
import test from "node:test";
import { positionHistoryPolicyFloor } from "./position-history-policy-floor";

test("history policy floor shares retention's canonical 90-day boundary", () => {
  assert.equal(positionHistoryPolicyFloor(new Date("2026-09-13T12:34:56.789Z")).toISOString(), "2026-06-10T02:00:00.000Z");
});

test("history policy floor rejects non-finite instants", () => {
  assert.throws(() => positionHistoryPolicyFloor(new Date(Number.NaN)), /Invalid position-history maintenance instant/);
});
