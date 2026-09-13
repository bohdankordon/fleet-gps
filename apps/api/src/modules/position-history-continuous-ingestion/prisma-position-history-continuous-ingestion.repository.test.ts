import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../generated/prisma/client";
import { PositionIngestionSource } from "../../generated/prisma/client";
import { normalizePositionHistoryCandidate } from "../position-history";
import { PrismaPositionHistoryContinuousIngestionRepository } from "./prisma-position-history-continuous-ingestion.repository";

test("vehicle discovery is deterministic, internal, mapped, and includes disabled vehicles", async () => {
  let query: unknown;
  const client = { vehicle: { findMany: async (value: unknown) => { query = value; return [{ id: "b", externalDeviceId: 2, disabled: true }, { id: "c", externalDeviceId: 3, disabled: false }]; } } } as unknown as PrismaClient;
  const repository = new PrismaPositionHistoryContinuousIngestionRepository({ getClient: () => client } as never);
  assert.deepEqual(await repository.listMappedVehicles(), [{ vehicleId: "b", externalDeviceId: 2, disabled: true }, { vehicleId: "c", externalDeviceId: 3, disabled: false }]);
  assert.deepEqual(query, { orderBy: { id: "asc" }, select: { id: true, externalDeviceId: true, disabled: true } });
});
test("recent replay uses the authoritative table and shared fingerprint idempotency", async () => {
  let input: { data: readonly unknown[]; skipDuplicates: boolean } | undefined;
  const client = { vehiclePositionObservation: { createMany: async (value: typeof input) => { input = value; return { count: 1 }; } } } as unknown as PrismaClient;
  const repository = new PrismaPositionHistoryContinuousIngestionRepository({ getClient: () => client } as never);
  const candidate = normalizePositionHistoryCandidate({ observedAt: new Date("2026-09-13T11:50:00Z"), latitude: 49.2, longitude: 28.4, speedKph: 10, valid: true, outdated: false, fetchedAt: new Date("2026-09-13T12:00:00Z"), ingestionSource: PositionIngestionSource.HISTORICAL_BACKFILL })!;
  assert.deepEqual(await repository.persistReplay("vehicle", [candidate, candidate]), { inserted: 1, duplicates: 1 });
  assert.equal(input?.skipDuplicates, true);
  assert.equal((input?.data[0] as { vehicleId: string }).vehicleId, "vehicle");
});
