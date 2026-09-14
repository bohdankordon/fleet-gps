import assert from "node:assert/strict";
import test from "node:test";
import { PositionIngestionSource } from "../../generated/prisma/client";
import { normalizePositionHistoryCandidate } from "../position-history";
import { PositionHistoryIngestionCursorService } from "./position-history-ingestion-cursor.service";
import type { PositionHistoryIngestionCursorRepository, VehicleHistoryIngestionCursor } from "./position-history-ingestion-cursor.types";

const vehicleId = "123e4567-e89b-42d3-a456-426614174000";
const now = new Date("2026-09-13T12:34:56.789Z");
const floor = new Date("2026-06-10T02:00:00.000Z");
const cursor = (): VehicleHistoryIngestionCursor => ({ vehicleId, coverageFrom: floor, confirmedThrough: floor, createdAt: now, updatedAt: now });

test("service initializes both correctness boundaries at the shared retention floor", async () => {
  const calls: Array<{ vehicleId: string; policyFloor: Date }> = [];
  const repository: PositionHistoryIngestionCursorRepository = {
    ensureCursor: async (id, policyFloor) => { calls.push({ vehicleId: id, policyFloor }); return cursor(); },
    findCursor: async () => null,
    persistContiguousResult: async () => ({ inserted: 0, duplicates: 0 }),
  };
  const result = await new PositionHistoryIngestionCursorService(repository).ensureCursor(vehicleId, now);
  assert.equal(result.coverageFrom.getTime(), result.confirmedThrough.getTime());
  assert.deepEqual(calls, [{ vehicleId, policyFloor: floor }]);
});

test("service preserves the repository contract without coupling fetch range to progress range", async () => {
  const overlap = normalizePositionHistoryCandidate({ observedAt: new Date("2026-06-09T01:55:00Z"), latitude: 49.2, longitude: 28.4, speedKph: 10, valid: true, outdated: false, fetchedAt: now, ingestionSource: PositionIngestionSource.HISTORICAL_BACKFILL })!;
  let captured: unknown;
  const repository: PositionHistoryIngestionCursorRepository = {
    ensureCursor: async () => cursor(),
    findCursor: async () => cursor(),
    persistContiguousResult: async (input) => { captured = input; return { inserted: 1, duplicates: 0 }; },
  };
  const input = { vehicleId, expectedCoverageFrom: floor, expectedConfirmedThrough: floor, nextConfirmedThrough: new Date("2026-06-09T02:05:00Z"), candidates: [overlap] } as const;
  assert.deepEqual(await new PositionHistoryIngestionCursorService(repository).persistContiguousResult(input), { inserted: 1, duplicates: 0 });
  assert.equal(captured, input);
  assert.ok(overlap.observedAt < input.expectedConfirmedThrough);
});
