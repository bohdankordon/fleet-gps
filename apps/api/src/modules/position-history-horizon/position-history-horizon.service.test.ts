import assert from "node:assert/strict";
import test from "node:test";
import { PositionBackfillStatus } from "../../generated/prisma/client";
import { estimatePositionHistoryBackfillRemainingWindows } from "../position-history-backfill/position-history-backfill-planning";
import { partitionPositionHistoryHorizon } from "./position-history-horizon-partition";
import { PositionHistoryHorizonService } from "./position-history-horizon.service";
import type { PositionHistoryHorizonCheckpointFact, PositionHistoryHorizonRepository } from "./position-history-horizon.types";

const to = new Date("2026-08-11T02:00:00.000Z");
const hour = 60 * 60 * 1_000;

test("remaining-window estimate reuses completed, missing, partial running, and pending cursor semantics", () => {
  const from = new Date("2026-08-01T00:00:00Z");
  const rangeTo = new Date(from.getTime() + 7 * 24 * hour);
  assert.equal(estimatePositionHistoryBackfillRemainingWindows({ rangeFrom: from, rangeTo, status: PositionBackfillStatus.COMPLETED, nextFrom: rangeTo }), 0);
  assert.equal(estimatePositionHistoryBackfillRemainingWindows({ rangeFrom: from, rangeTo, status: null, nextFrom: null }), 168);
  assert.equal(estimatePositionHistoryBackfillRemainingWindows({ rangeFrom: from, rangeTo, status: PositionBackfillStatus.RUNNING, nextFrom: new Date(from.getTime() + 26 * hour) }), 142);
  assert.equal(estimatePositionHistoryBackfillRemainingWindows({ rangeFrom: from, rangeTo, status: PositionBackfillStatus.PENDING, nextFrom: from }), 168);
});

test("plans whole-fleet and provider-eligible incomplete work independently in chronological slice order", async () => {
  const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
  const repository: PositionHistoryHorizonRepository = { inspect: async (slices) => slices.flatMap((slice): PositionHistoryHorizonCheckpointFact[] => [
    { sliceIndex: slice.index, vehicleId: ids[0]!, providerDisabled: false, exactCheckpointStatus: slice.index === 0 ? PositionBackfillStatus.COMPLETED : null, exactCheckpointNextFrom: slice.index === 0 ? slice.to : null },
    { sliceIndex: slice.index, vehicleId: ids[1]!, providerDisabled: true, exactCheckpointStatus: slice.index === 0 ? PositionBackfillStatus.PENDING : PositionBackfillStatus.COMPLETED, exactCheckpointNextFrom: slice.index === 0 ? slice.from : slice.to },
  ]) };
  const result = await new PositionHistoryHorizonService(repository).run(to);
  assert.deepEqual(result.fleet, { total: 2, providerDisabled: 1, providerEligible: 1 });
  assert.equal(result.targets.total, 13);
  assert.equal(result.targets.fullSevenDay, 12);
  assert.equal(result.targets.remainderDurationMs, 6 * 24 * hour);
  assert.deepEqual(result.targetVehiclePairs, { total: 26, completed: 13, incomplete: 13, providerEligibleIncomplete: 12 });
  assert.equal(result.estimatedRemainingHourlyWindows, 12 * 168);
  assert.deepEqual(result.slices.map((slice) => slice.index), [...Array(13).keys()]);
  assert.equal(result.slices[0]?.remainingFleetVehicles, 1);
  assert.equal(result.slices[0]?.providerEligibleRemaining, 0);
  assert.equal(result.slices[0]?.estimatedRemainingHourlyWindows, 0);
  assert.equal(result.slices[1]?.providerEligibleRemaining, 1);
});

test("rejects an invalid anchor before repository access", async () => {
  let reads = 0;
  const planner = new PositionHistoryHorizonService({ inspect: async () => { reads += 1; return []; } });
  await assert.rejects(planner.run(new Date("invalid")));
  assert.equal(reads, 0);
});

test("rejects inconsistent non-deterministic repository ordering", async () => {
  const slices = partitionPositionHistoryHorizon(to, 90);
  const planner = new PositionHistoryHorizonService({ inspect: async () => [
    { sliceIndex: slices[0]!.index, vehicleId: "00000000-0000-4000-8000-000000000001", providerDisabled: false, exactCheckpointStatus: null, exactCheckpointNextFrom: null },
  ] });
  await assert.rejects(planner.run(to), /Inconsistent/);
});
