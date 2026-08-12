import assert from "node:assert/strict";
import test from "node:test";
import { PositionBackfillStatus } from "../../generated/prisma/client";
import { PositionHistoryHorizonService } from "../position-history-horizon/position-history-horizon.service";
import type { PositionHistoryHorizonCheckpointFact, PositionHistoryHorizonRepository } from "../position-history-horizon/position-history-horizon.types";
import { toPositionHistoryHorizonStatusResponse } from "./position-history-status.read-model";
import { PositionHistoryStatusService } from "./position-history-status.service";
import type { PositionHistoryStatusObservationRepository } from "./position-history-status.types";

const anchor = new Date("2026-08-11T02:00:00.000Z");

test("combines reused arbitrary-slice horizon planning with a separate observation aggregate", async () => {
  let planReads = 0;
  let observationReads = 0;
  const horizonRepository: PositionHistoryHorizonRepository = { inspect: async (slices) => {
    planReads += 1;
    return slices.flatMap((slice): PositionHistoryHorizonCheckpointFact[] => [
      { sliceIndex: slice.index, vehicleId: "a", providerDisabled: false, exactCheckpointStatus: slice.index === 0 ? PositionBackfillStatus.COMPLETED : PositionBackfillStatus.RUNNING, exactCheckpointNextFrom: slice.index === 0 ? slice.to : new Date(slice.from.getTime() + 24 * 3_600_000) },
      { sliceIndex: slice.index, vehicleId: "b", providerDisabled: true, exactCheckpointStatus: PositionBackfillStatus.PENDING, exactCheckpointNextFrom: slice.from },
      { sliceIndex: slice.index, vehicleId: "c", providerDisabled: false, exactCheckpointStatus: null, exactCheckpointNextFrom: null },
    ]);
  } };
  const observations: PositionHistoryStatusObservationRepository = { inspect: async (from, to) => {
    observationReads += 1;
    assert.equal(from.toISOString(), "2026-05-13T02:00:00.000Z");
    assert.equal(to.toISOString(), anchor.toISOString());
    return { rowCount: 11, vehiclesWithObservations: 2, firstObservationAt: new Date("2026-06-01T00:00:00Z"), lastObservationAt: new Date("2026-08-10T00:00:00Z") };
  } };
  const result = await new PositionHistoryStatusService(new PositionHistoryHorizonService(horizonRepository), observations).inspect(anchor);
  const response = toPositionHistoryHorizonStatusResponse(result);

  assert.equal(planReads, 1);
  assert.equal(observationReads, 1);
  assert.equal(response.policyDays, 90);
  assert.equal(response.slices.total, 13);
  assert.equal(response.fleet.total, 3);
  assert.equal(response.fleet.providerDisabled, 1);
  assert.equal(response.fleet.providerEligible, 2);
  assert.equal(response.backfill.targetVehiclePairs, 39);
  assert.equal(response.backfill.completedPairs, 1);
  assert.equal(response.backfill.incompletePairs, 38);
  assert.equal(response.backfill.providerEligibleIncompletePairs, 25);
  assert.deepEqual(response.observations, { rowCount: 11, vehiclesWithObservations: 2, vehiclesWithoutObservations: 1, firstObservationAt: "2026-06-01T00:00:00.000Z", lastObservationAt: "2026-08-10T00:00:00.000Z" });
  assert.deepEqual(response.sliceStatuses[0] && { completed: response.sliceStatuses[0].completed, running: response.sliceStatuses[0].running, pending: response.sliceStatuses[0].pending, none: response.sliceStatuses[0].none }, { completed: 1, running: 0, pending: 1, none: 1 });
  assert.deepEqual(response.sliceStatuses[1] && { completed: response.sliceStatuses[1].completed, running: response.sliceStatuses[1].running, pending: response.sliceStatuses[1].pending, none: response.sliceStatuses[1].none }, { completed: 0, running: 1, pending: 1, none: 1 });
});

test("safe product DTO keeps checkpoint and observation facts independent and exposes no sensitive fields", async () => {
  const plan = await new PositionHistoryHorizonService({ inspect: async (slices) => slices.map((slice) => ({ sliceIndex: slice.index, vehicleId: "secret-vehicle-uuid", providerDisabled: false, exactCheckpointStatus: PositionBackfillStatus.COMPLETED, exactCheckpointNextFrom: slice.to })) }).run(anchor);
  const response = toPositionHistoryHorizonStatusResponse({ plan, observations: { rowCount: 0, vehiclesWithObservations: 0, firstObservationAt: null, lastObservationAt: null } });
  assert.equal(response.backfill.completedPairs, response.backfill.targetVehiclePairs);
  assert.equal(response.observations.rowCount, 0);
  const json = JSON.stringify(response);
  for (const forbidden of ["secret-vehicle-uuid", "vehicleId", "externalDeviceId", "latitude", "longitude", "fingerprint", "nextFrom", "completeness", "coverage"]) assert.equal(json.includes(forbidden), false);
});

test("observations may exist while checkpoints remain incomplete", async () => {
  const plan = await new PositionHistoryHorizonService({ inspect: async (slices) => slices.map((slice) => ({ sliceIndex: slice.index, vehicleId: "a", providerDisabled: false, exactCheckpointStatus: null, exactCheckpointNextFrom: null })) }).run(anchor);
  const response = toPositionHistoryHorizonStatusResponse({ plan, observations: { rowCount: 9, vehiclesWithObservations: 1, firstObservationAt: anchor, lastObservationAt: anchor } });
  assert.equal(response.backfill.completedPairs, 0);
  assert.equal(response.observations.rowCount, 9);
});
