import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { PositionBackfillStatus } from "../../generated/prisma/client";
import { PositionHistoryHorizonService } from "../position-history-horizon/position-history-horizon.service";
import type { PositionHistoryHorizonCheckpointFact, PositionHistoryHorizonRepository } from "../position-history-horizon/position-history-horizon.types";
import { toPositionHistoryHorizonPlanResponse } from "./position-history-horizon-plan.read-model";

const anchor = new Date("2026-08-11T02:00:00.000Z");

function repository(facts: (slice: { index: number; from: Date; to: Date }) => PositionHistoryHorizonCheckpointFact[]): PositionHistoryHorizonRepository {
  return { inspect: async (slices) => slices.flatMap((slice) => facts(slice)) };
}

test("manual population planning exposes checkpoint planning facts without any stored-observation aggregate", async () => {
  let planReads = 0;
  const service = new PositionHistoryHorizonService({ inspect: async (slices) => { planReads += 1; return slices.flatMap((slice): PositionHistoryHorizonCheckpointFact[] => [
    { sliceIndex: slice.index, vehicleId: "a", providerDisabled: false, exactCheckpointStatus: slice.index === 0 ? PositionBackfillStatus.COMPLETED : PositionBackfillStatus.RUNNING, exactCheckpointNextFrom: slice.index === 0 ? slice.to : new Date(slice.from.getTime() + 24 * 3_600_000) },
    { sliceIndex: slice.index, vehicleId: "b", providerDisabled: true, exactCheckpointStatus: PositionBackfillStatus.PENDING, exactCheckpointNextFrom: slice.from },
    { sliceIndex: slice.index, vehicleId: "c", providerDisabled: false, exactCheckpointStatus: null, exactCheckpointNextFrom: null },
  ]); } });
  const response = toPositionHistoryHorizonPlanResponse(await service.run(anchor));

  assert.equal(planReads, 1);
  assert.equal(response.policyDays, 90);
  assert.equal(response.slices.total, 13);
  assert.equal(response.from, "2026-05-13T02:00:00.000Z");
  assert.equal(response.to, anchor.toISOString());
  assert.equal(response.fleet.total, 3);
  assert.equal(response.fleet.providerDisabled, 1);
  assert.equal(response.fleet.providerEligible, 2);
  assert.equal(response.backfill.targetVehiclePairs, 39);
  assert.equal(response.backfill.completedPairs, 1);
  assert.equal(response.backfill.incompletePairs, 38);
  assert.equal(response.backfill.providerEligibleIncompletePairs, 25);
  assert.deepEqual(response.sliceStatuses[0] && { completed: response.sliceStatuses[0].completed, running: response.sliceStatuses[0].running, pending: response.sliceStatuses[0].pending, none: response.sliceStatuses[0].none }, { completed: 1, running: 0, pending: 1, none: 1 });
  assert.deepEqual(response.sliceStatuses[1] && { completed: response.sliceStatuses[1].completed, running: response.sliceStatuses[1].running, pending: response.sliceStatuses[1].pending, none: response.sliceStatuses[1].none }, { completed: 0, running: 1, pending: 1, none: 1 });
  assert.equal("observations" in response, false);
});

test("manual checkpoint planning stays independent from stored observation volume", async () => {
  const plan = await new PositionHistoryHorizonService(repository((slice) => [{ sliceIndex: slice.index, vehicleId: "a", providerDisabled: false, exactCheckpointStatus: null, exactCheckpointNextFrom: null }])).run(anchor);
  const response = toPositionHistoryHorizonPlanResponse(plan);
  assert.equal(response.backfill.completedPairs, 0);
  assert.equal(response.backfill.incompletePairs, response.backfill.targetVehiclePairs);
  const json = JSON.stringify(response);
  for (const forbidden of ["rowCount", "vehiclesWithObservations", "firstObservationAt", "lastObservationAt", "vehicleId", "secret-vehicle-uuid", "externalDeviceId", "latitude", "longitude", "fingerprint", "nextFrom", "completeness", "coverage"]) assert.equal(json.includes(forbidden), false, forbidden);
});

test("API source no longer contains a full stored-observation aggregate on any read path", () => {
  const sourceRoot = resolve(__dirname, "../../../src");
  const files = (function walk(directory: string): string[] {
    return readdirSync(directory).flatMap((entry) => {
      const value = join(directory, entry);
      return statSync(value).isDirectory() ? walk(value) : value.endsWith(".ts") && !value.endsWith(".test.ts") ? [value] : [];
    });
  })(sourceRoot);
  const aggregates = ["COUNT(DISTINCT observation.vehicle_id)", "PositionHistoryStatusObservationRepository", "PositionHistoryObservationAggregate"];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const forbidden of aggregates) assert.equal(source.includes(forbidden), false, file + ": " + forbidden);
  }
  const moduleSources = files.filter((file) => file.includes(`position-history-status`)).map((file) => readFileSync(file, "utf8")).join("\n");
  assert.equal(moduleSources.includes("vehicle_position_observations"), false);
  const adminReadPath = files.filter((file) => file.includes(`position-history-status`) || file.includes(`app.module`)).map((file) => readFileSync(file, "utf8")).join("\n");
  assert.equal(adminReadPath.includes("$queryRaw"), false);
  assert.equal(moduleSources.includes("PositionHistoryStatusObservationRepository"), false);
});
