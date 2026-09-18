import assert from "node:assert/strict";
import test from "node:test";
import { classifyTripAnalysisPresentation } from "./trip-analysis-presentation-state";

const classify = (rawObservationCount: number, tripCount: number, stopCount: number, gapCount: number) =>
  classifyTripAnalysisPresentation({ rawObservationCount, tripCount, stopCount, gapCount });

test("distinguishes missing input, empty chronology, gaps-only, and normal chronology", () => {
  assert.equal(classify(0, 0, 0, 0), "NO_OBSERVATIONS");
  assert.equal(classify(4, 0, 0, 0), "EMPTY_CHRONOLOGY");
  assert.equal(classify(4, 0, 0, 1), "GAPS_ONLY");
  assert.equal(classify(4, 1, 0, 0), "NORMAL");
  assert.equal(classify(4, 0, 1, 0), "NORMAL");
  assert.equal(classify(4, 1, 1, 2), "NORMAL");
});
