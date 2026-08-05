import assert from "node:assert/strict";
import test from "node:test";
import type { DailyRun } from "@taxi-gps/equgps";
import { DailyRunsValidationError } from "./dashboard.types";
import { normalizeDailyRuns } from "./daily-runs-mappers";

test("normalizes valid and zero-distance runs without exposing raw fields", () => {
  const result = normalizeDailyRuns([{ deviceId: 1, distanceMeters: 0 }, { deviceId: 2, distanceMeters: 125.5 }]);
  assert.deepEqual(result, { runs: [{ externalDeviceId: 1, distanceMeters: 0 }, { externalDeviceId: 2, distanceMeters: 125.5 }], duplicateRuns: 0 });
  assert.equal("deviceId" in result.runs[0]!, false);
});

test("keeps the last duplicate run and counts each extra row", () => {
  const result = normalizeDailyRuns([{ deviceId: 1, distanceMeters: 1 }, { deviceId: 1, distanceMeters: 2 }, { deviceId: 1, distanceMeters: 3 }]);
  assert.equal(result.duplicateRuns, 2);
  assert.deepEqual(result.runs, [{ externalDeviceId: 1, distanceMeters: 3 }]);
});

test("rejects invalid run invariants before they reach a repository", () => {
  for (const run of [{ deviceId: 0, distanceMeters: 1 }, { deviceId: -1, distanceMeters: 1 }, { deviceId: 1.5, distanceMeters: 1 }, { deviceId: 1, distanceMeters: -1 }, { deviceId: 1, distanceMeters: Number.NaN }, { deviceId: 1, distanceMeters: Number.POSITIVE_INFINITY }]) {
    assert.throws(() => normalizeDailyRuns([run] as readonly DailyRun[]), DailyRunsValidationError);
  }
});
