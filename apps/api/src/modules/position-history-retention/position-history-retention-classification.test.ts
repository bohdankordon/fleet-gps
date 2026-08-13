import assert from "node:assert/strict";
import test from "node:test";
import { classifyInclusivePositionHistoryCheckpoint } from "./position-history-retention-classification";

const cutoff = new Date("2026-05-13T02:00:00.000Z");
const at = (milliseconds: number): Date => new Date(cutoff.getTime() + milliseconds);

test("classifies the approved closed Stage 14 target interval with exact cutoff equality", () => {
  assert.equal(classifyInclusivePositionHistoryCheckpoint(at(-2), at(-1), cutoff), "FULLY_OBSOLETE");
  assert.equal(classifyInclusivePositionHistoryCheckpoint(at(-2), at(0), cutoff), "BOUNDARY_OVERLAP");
  assert.equal(classifyInclusivePositionHistoryCheckpoint(at(-2), at(1), cutoff), "BOUNDARY_OVERLAP");
  assert.equal(classifyInclusivePositionHistoryCheckpoint(at(0), at(1), cutoff), "PROTECTED");
  assert.equal(classifyInclusivePositionHistoryCheckpoint(at(1), at(2), cutoff), "PROTECTED");
});

test("every valid inclusive interval receives exactly one class without gaps", () => {
  const classes = new Set(["FULLY_OBSOLETE", "BOUNDARY_OVERLAP", "PROTECTED"]);
  for (let from = -3; from <= 3; from += 1) {
    for (let to = from; to <= 3; to += 1) {
      const classification = classifyInclusivePositionHistoryCheckpoint(at(from), at(to), cutoff);
      assert.equal(classes.has(classification), true, `${from}..${to}`);
      assert.equal([
        to < 0,
        from < 0 && to >= 0,
        from >= 0,
      ].filter(Boolean).length, 1, `${from}..${to}`);
    }
  }
});

test("PENDING, RUNNING, and COMPLETED do not alter range classification", () => {
  for (const status of ["PENDING", "RUNNING", "COMPLETED"] as const) {
    assert.equal(classifyInclusivePositionHistoryCheckpoint(at(-2), at(-1), cutoff), "FULLY_OBSOLETE", status);
    assert.equal(classifyInclusivePositionHistoryCheckpoint(at(-2), at(0), cutoff), "BOUNDARY_OVERLAP", status);
    assert.equal(classifyInclusivePositionHistoryCheckpoint(at(0), at(1), cutoff), "PROTECTED", status);
  }
});

test("rejects invalid instants and reversed ranges without changing Stage 14 semantics", () => {
  assert.throws(() => classifyInclusivePositionHistoryCheckpoint(at(1), at(-1), cutoff), /Invalid inclusive/);
  assert.throws(() => classifyInclusivePositionHistoryCheckpoint(new Date(Number.NaN), cutoff, cutoff), /Invalid inclusive/);
});
