import assert from "node:assert/strict";
import test from "node:test";
import { selectNearestMapFeature, updateFleetMapHoverState, type FleetMapHoverCandidate } from "./fleet-map-hover-target";

const point = (id: string, x: number, y: number): FleetMapHoverCandidate => ({ id, coordinate: [x, y] });
const project = ([x, y]: readonly [number, number]) => ({ x, y });

test("selects the only candidate inside the ergonomic threshold", () => {
  assert.equal(selectNearestMapFeature([point("vehicle-a", 12, 10)], { x: 10, y: 10 }, project, 18), "vehicle-a");
});

test("selects the nearest center regardless of MapLibre result order", () => {
  const fartherFirst = [point("farther", 17, 10), point("nearest", 11, 10)];
  assert.equal(selectNearestMapFeature(fartherFirst, { x: 10, y: 10 }, project, 18), "nearest");
  assert.equal(selectNearestMapFeature([...fartherFirst].reverse(), { x: 10, y: 10 }, project, 18), "nearest");
});

test("selects the nearest of three overlapping hit areas", () => {
  assert.equal(selectNearestMapFeature([point("a", 21, 20), point("b", 16, 20), point("c", 19, 20)], { x: 18, y: 20 }, project, 18), "c");
});

test("breaks equal and near-equal distances deterministically by stable feature ID", () => {
  const candidates = [point("vehicle-b", 9, 10), point("vehicle-a", 11, 10 + 1e-12)];
  assert.equal(selectNearestMapFeature(candidates, { x: 10, y: 10 }, project, 18), "vehicle-a");
  assert.equal(selectNearestMapFeature([...candidates].reverse(), { x: 10, y: 10 }, project, 18), "vehicle-a");
});

test("rejects candidates outside the centralized hit-radius threshold", () => {
  assert.equal(selectNearestMapFeature([point("outside", 28.01, 10)], { x: 10, y: 10 }, project, 18), null);
});

test("deduplicates repeated feature IDs and keeps their closest rendered copy", () => {
  const candidates = [point("same-id", 28, 10), point("other", 15, 10), point("same-id", 11, 10)];
  assert.equal(selectNearestMapFeature(candidates, { x: 10, y: 10 }, project, 18), "same-id");
});

test("clears the old feature-state and sets only the nearest target", () => {
  const calls: unknown[] = [];
  const writer = { setFeatureState: (target: unknown, state: unknown) => { calls.push({ target, state }); } };
  assert.equal(updateFleetMapHoverState(writer, "fleet-vehicles", "old-id", "nearest-id"), "nearest-id");
  assert.deepEqual(calls, [
    { target: { source: "fleet-vehicles", id: "old-id" }, state: { hover: false } },
    { target: { source: "fleet-vehicles", id: "nearest-id" }, state: { hover: true } },
  ]);
});

test("does not rewrite feature-state when the nearest target is unchanged", () => {
  let calls = 0;
  const writer = { setFeatureState: () => { calls += 1; } };
  assert.equal(updateFleetMapHoverState(writer, "fleet-vehicles", "same-id", "same-id"), "same-id");
  assert.equal(calls, 0);
});
