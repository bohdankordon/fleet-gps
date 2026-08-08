import assert from "node:assert/strict";
import test from "node:test";
import type { ApiConfig } from "../../config/api-config";
import { VehicleStatus } from "../../generated/prisma/client";
import type { AlertEvaluationObservation } from "../alert-evaluation";
import type { AlertObservationIngestionResult } from "../alert-ingestion";
import type { AlertObservationIngestionService } from "../alert-ingestion";
import { FleetAlertIdentityResolutionError, FleetAlertIngestionService } from "./fleet-alert-ingestion.service";
import type { FleetPersistedVehicleIdentity, FleetSnapshotVehicle } from "./fleet.types";

const fetchedAt = new Date("2026-08-08T12:00:00.000Z");
const fixTime = new Date("2026-08-08T11:59:30.000Z");
const internalId = "11111111-1111-4111-8111-111111111111";

function config(enabled: boolean): ApiConfig {
  return { alertIngestion: { enabled } } as ApiConfig;
}

function vehicle(overrides: Partial<FleetSnapshotVehicle> = {}): FleetSnapshotVehicle {
  return {
    externalDeviceId: 101,
    name: "Vehicle",
    disabled: false,
    status: VehicleStatus.ONLINE,
    externalLastUpdateAt: null,
    fetchedAt,
    position: { fixTime, latitude: 49.2, longitude: 28.4, speedKph: 0, valid: true, outdated: false },
    ...overrides,
  };
}

function identity(externalDeviceId = 101, vehicleId = internalId): FleetPersistedVehicleIdentity {
  return { externalDeviceId, vehicleId };
}

function ingestionResult(observation: AlertEvaluationObservation, overrides: Partial<AlertObservationIngestionResult> = {}): AlertObservationIngestionResult {
  return {
    vehicleId: String(observation.vehicleId),
    observedAt: String(observation.observedAt),
    journalOutcome: "CREATED",
    processingPerformed: true,
    evaluation: null,
    processed: true,
    ...overrides,
  };
}

function subject(enabled: boolean, ingest: (observation: AlertEvaluationObservation) => Promise<AlertObservationIngestionResult>) {
  return new FleetAlertIngestionService(config(enabled), { ingestObservation: ingest } as AlertObservationIngestionService);
}

test("disabled flag returns deterministic zeros without touching alert ingestion", async () => {
  let calls = 0;
  const result = await subject(false, async (observation) => { calls += 1; return ingestionResult(observation); }).ingestSnapshot([vehicle()], []);
  assert.equal(calls, 0);
  assert.deepEqual(result, { alertCandidates: 0, alertProcessed: 0, alertAlreadyProcessed: 0, alertSkipped: 0 });
});

test("valid zero-speed position uses internal UUID and fixTime rather than fetchedAt", async () => {
  const observations: AlertEvaluationObservation[] = [];
  const result = await subject(true, async (observation) => { observations.push(observation); return ingestionResult(observation); }).ingestSnapshot([vehicle()], [identity()]);
  assert.deepEqual(observations, [{ vehicleId: internalId, observedAt: fixTime.toISOString(), latitude: 49.2, longitude: 28.4, speedKph: 0 }]);
  assert.notEqual(observations[0]?.observedAt, fetchedAt.toISOString());
  assert.deepEqual(result, { alertCandidates: 1, alertProcessed: 1, alertAlreadyProcessed: 0, alertSkipped: 0 });
});

const skippedCases: readonly [string, FleetSnapshotVehicle][] = [
  ["disabled vehicle", vehicle({ disabled: true })],
  ["missing position", vehicle({ position: null })],
  ["valid false", vehicle({ position: { ...vehicle().position!, valid: false } })],
  ["valid null", vehicle({ position: { ...vehicle().position!, valid: null } })],
  ["outdated true", vehicle({ position: { ...vehicle().position!, outdated: true } })],
  ["outdated null", vehicle({ position: { ...vehicle().position!, outdated: null } })],
  ["missing fix time", vehicle({ position: { ...vehicle().position!, fixTime: null } })],
  ["missing latitude", vehicle({ position: { ...vehicle().position!, latitude: null } })],
  ["missing longitude", vehicle({ position: { ...vehicle().position!, longitude: null } })],
  ["missing speed", vehicle({ position: { ...vehicle().position!, speedKph: null } })],
];

for (const [name, skippedVehicle] of skippedCases) {
  test(`${name} is skipped without a synthetic observation`, async () => {
    let calls = 0;
    const result = await subject(true, async (observation) => { calls += 1; return ingestionResult(observation); }).ingestSnapshot([skippedVehicle], [identity()]);
    assert.equal(calls, 0);
    assert.deepEqual(result, { alertCandidates: 0, alertProcessed: 0, alertAlreadyProcessed: 0, alertSkipped: 1 });
  });
}

test("fixTime beyond the shared future-skew allowance is skipped", async () => {
  let calls = 0;
  const future = vehicle({ position: { ...vehicle().position!, fixTime: new Date(fetchedAt.getTime() + 60_001) } });
  const result = await subject(true, async (observation) => { calls += 1; return ingestionResult(observation); }).ingestSnapshot([future], [identity()]);
  assert.equal(calls, 0);
  assert.equal(result.alertSkipped, 1);
});

test("fixTime at the shared future-skew boundary remains eligible", async () => {
  const observations: AlertEvaluationObservation[] = [];
  const allowed = vehicle({ position: { ...vehicle().position!, fixTime: new Date(fetchedAt.getTime() + 60_000) } });
  await subject(true, async (observation) => { observations.push(observation); return ingestionResult(observation); }).ingestSnapshot([allowed], [identity()]);
  assert.equal(observations.length, 1);
});

test("repeated current position preserves journal identity and reports dedupe", async () => {
  const observations: AlertEvaluationObservation[] = [];
  const seen = new Set<string>();
  const service = subject(true, async (observation) => {
    observations.push(observation);
    const key = `${String(observation.vehicleId)}:${String(observation.observedAt)}`;
    if (seen.has(key)) return ingestionResult(observation, { journalOutcome: "ALREADY_PROCESSED", processingPerformed: false });
    seen.add(key);
    return ingestionResult(observation);
  });
  const first = await service.ingestSnapshot([vehicle()], [identity()]);
  const repeated = await service.ingestSnapshot([vehicle({ fetchedAt: new Date(fetchedAt.getTime() + 60_000) })], [identity()]);
  assert.equal(observations[0]?.observedAt, observations[1]?.observedAt);
  assert.equal(first.alertProcessed, 1);
  assert.deepEqual(repeated, { alertCandidates: 1, alertProcessed: 0, alertAlreadyProcessed: 1, alertSkipped: 0 });
});

test("all eligible vehicles are attempted before the first original failure is propagated", async () => {
  const ids = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ];
  const vehicles = ids.map((_, index) => vehicle({ externalDeviceId: index + 1 }));
  const identities = ids.map((vehicleId, index) => identity(index + 1, vehicleId));
  const failure = new Error("database failure");
  const attempted: string[] = [];
  const service = subject(true, async (observation) => {
    attempted.push(String(observation.vehicleId));
    if (observation.vehicleId === ids[1]) throw failure;
    return ingestionResult(observation);
  });
  await assert.rejects(service.ingestSnapshot(vehicles, identities), (error) => error === failure);
  assert.deepEqual(attempted, ids);
});

test("multiple failures propagate the first original error in candidate order", async () => {
  const first = new Error("first"); const second = new Error("second");
  const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
  const service = subject(true, async (observation) => { throw observation.vehicleId === ids[0] ? first : second; });
  await assert.rejects(service.ingestSnapshot(ids.map((_, index) => vehicle({ externalDeviceId: index + 1 })), ids.map((id, index) => identity(index + 1, id))), (error) => error === first);
});

test("missing internal identity is a typed safe failure and does not prevent later attempts", async () => {
  let ingestionCalls = 0;
  const vehicles = [vehicle({ externalDeviceId: 1 }), vehicle({ externalDeviceId: 2 })];
  const service = subject(true, async (observation) => { ingestionCalls += 1; return ingestionResult(observation); });
  await assert.rejects(service.ingestSnapshot(vehicles, [identity(2)]), (error: unknown) => {
    assert.ok(error instanceof FleetAlertIdentityResolutionError);
    assert.equal(error.message.includes("1"), false);
    assert.equal(error.message.includes("49.2"), false);
    return true;
  });
  assert.equal(ingestionCalls, 1);
});

test("authoritative ingestion retains numeric validation responsibility", async () => {
  let calls = 0;
  const invalidNumeric = vehicle({ position: { ...vehicle().position!, speedKph: Number.NaN } });
  const result = await subject(true, async (observation) => { calls += 1; return ingestionResult(observation, { journalOutcome: "INVALID", processingPerformed: false, processed: false }); }).ingestSnapshot([invalidNumeric], [identity()]);
  assert.equal(calls, 1);
  assert.deepEqual(result, { alertCandidates: 1, alertProcessed: 0, alertAlreadyProcessed: 0, alertSkipped: 1 });
});
