import assert from "node:assert/strict";
import test from "node:test";
import { positionHistoryCheckpointCivil, positionHistoryCheckpointDraft } from "./position-history-checkpoint";
import { kyivLocalToAbsolute } from "./vehicle-track/vehicle-track-custom-range";

test("checkpoint editor converts between the accepted 24-hour display and Kyiv civil value", () => {
  assert.deepEqual(positionHistoryCheckpointDraft("2026-08-11T05:07"), { date: "11.08.2026", time: "05:07" });
  assert.equal(positionHistoryCheckpointCivil({ date: "11.08.2026", time: "05:07" }), "2026-08-11T05:07");
  assert.deepEqual(positionHistoryCheckpointDraft(null), { date: "", time: "" });
  assert.equal(positionHistoryCheckpointCivil({ date: "08/11/2026", time: "5:07 PM" }), null);
});

test("editor composition does not weaken Kyiv DST validation", () => {
  const nonexistent = positionHistoryCheckpointCivil({ date: "29.03.2026", time: "03:30" });
  const ambiguous = positionHistoryCheckpointCivil({ date: "25.10.2026", time: "03:30" });
  assert.equal(kyivLocalToAbsolute(nonexistent!).error, "NONEXISTENT");
  assert.equal(kyivLocalToAbsolute(ambiguous!).error, "AMBIGUOUS");
});
