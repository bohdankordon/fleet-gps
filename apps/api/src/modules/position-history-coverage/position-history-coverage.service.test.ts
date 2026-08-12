import assert from "node:assert/strict";
import test from "node:test";
import { PositionBackfillStatus, PositionIngestionSource } from "../../generated/prisma/client";
import { normalizePositionHistoryCandidate } from "../position-history";
import { PositionHistoryCoverageService } from "./position-history-coverage.service";
import type { PositionHistoryCoverageRepository, PositionHistoryCoverageVehicleFacts } from "./position-history-coverage.types";

const from = new Date("2026-08-10T02:00:00.000Z");
const to = new Date("2026-08-11T02:00:00.000Z");

function fact(overrides: Partial<PositionHistoryCoverageVehicleFacts> = {}): PositionHistoryCoverageVehicleFacts {
  return { vehicleId: crypto.randomUUID(), providerDisabled: false, exactCheckpointStatus: null, observationRows: 0, fleetSyncRows: 0, historicalBackfillRows: 0, firstObservedAt: null, lastObservedAt: null, ...overrides };
}

function service(rows: readonly PositionHistoryCoverageVehicleFacts[]): PositionHistoryCoverageService {
  const repository: PositionHistoryCoverageRepository = { inspect: async () => rows };
  return new PositionHistoryCoverageService(repository);
}

test("reports exact checkpoint states, provider-disabled orthogonality, and neutral checkpoint x observation facts", async () => {
  const result = await service([
    fact({ exactCheckpointStatus: PositionBackfillStatus.COMPLETED, observationRows: 0, providerDisabled: true }),
    fact({ exactCheckpointStatus: PositionBackfillStatus.COMPLETED, observationRows: 2, fleetSyncRows: 1, historicalBackfillRows: 1, firstObservedAt: new Date("2026-08-10T03:00:00Z"), lastObservedAt: new Date("2026-08-10T04:00:00Z") }),
    fact({ exactCheckpointStatus: PositionBackfillStatus.PENDING, observationRows: 1, fleetSyncRows: 1, firstObservedAt: new Date("2026-08-10T02:00:00Z"), lastObservedAt: new Date("2026-08-10T02:00:00Z") }),
    fact({ exactCheckpointStatus: PositionBackfillStatus.RUNNING }),
    fact({ observationRows: 2, historicalBackfillRows: 2, firstObservedAt: new Date("2026-08-11T02:00:00Z"), lastObservedAt: new Date("2026-08-11T02:00:00Z"), providerDisabled: true }),
  ]).run({ from, to });
  assert.deepEqual(result.checkpointCoverage, { vehiclesTotal: 5, completed: 2, running: 1, pending: 1, noExactCheckpoint: 1 });
  assert.equal(result.providerDisabledVehicles, 2);
  assert.deepEqual(result.observationPresence, { rowsTotal: 5, vehiclesWithObservations: 3, vehiclesWithoutObservations: 2, fleetSyncRows: 2, historicalBackfillRows: 3, firstObservedAt: new Date("2026-08-10T02:00:00Z"), lastObservedAt: new Date("2026-08-11T02:00:00Z") });
  assert.deepEqual(result.checkpointObservationCrossSummary, { completedWithObservations: 1, completedWithoutObservations: 1, incompleteOrNoExactCheckpointWithObservations: 2, incompleteOrNoExactCheckpointWithoutObservations: 1 });
});

test("reports an empty observation range with nullable boundaries", async () => {
  const result = await service([fact({ exactCheckpointStatus: PositionBackfillStatus.COMPLETED }), fact()]).run({ from, to });
  assert.deepEqual(result.observationPresence, { rowsTotal: 0, vehiclesWithObservations: 0, vehiclesWithoutObservations: 2, fleetSyncRows: 0, historicalBackfillRows: 0, firstObservedAt: null, lastObservedAt: null });
});

test("same-timestamp distinct normalized fixes remain separate observation rows", () => {
  const shared = { observedAt: from, speedKph: 10, valid: true, outdated: false, fetchedAt: from, ingestionSource: PositionIngestionSource.FLEET_SYNC };
  const first = normalizePositionHistoryCandidate({ ...shared, latitude: 49, longitude: 28 });
  const second = normalizePositionHistoryCandidate({ ...shared, latitude: 49.0001, longitude: 28 });
  assert.notEqual(first?.fixFingerprint, second?.fixFingerprint);
  assert.equal(new Set([first?.fixFingerprint, second?.fixFingerprint]).size, 2);
});

test("rejects empty, non-finite, and longer-than-seven-day targets before repository access", async () => {
  let reads = 0;
  const audit = new PositionHistoryCoverageService({ inspect: async () => { reads += 1; return []; } });
  await assert.rejects(audit.run({ from, to: from }));
  await assert.rejects(audit.run({ from, to: new Date("invalid") }));
  await assert.rejects(audit.run({ from, to: new Date(from.getTime() + 7 * 86_400_000 + 1) }));
  assert.equal(reads, 0);
  await audit.run({ from, to: new Date(from.getTime() + 7 * 86_400_000) });
  assert.equal(reads, 1);
});
