import assert from "node:assert/strict";
import test from "node:test";
import type { AlertEvaluationObservation, AlertEvaluationResult } from "../alert-evaluation";
import { AlertEvaluationService } from "../alert-evaluation";
import type { AlertRulesSettings, AlertSettingsService } from "../alert-settings";
import type { AlertEventProcessorService, InactivityAlertEventProcessingResult, SpeedingAlertEventProcessingResult } from "../alert-events";
import type { CityGeofenceService } from "../city-geofence";
import { InactivityDetectorService, InactivityDetectorStateMachine, type InactivityDetectionResult } from "../inactivity-detector";
import { SpeedingDetectorService, SpeedingDetectorStateMachine, type SpeedingDetectionResult } from "../speeding-detector";
import type { AlertEvaluationJournalObservation, CreateOrFindAlertObservationResult, DurableAlertObservation } from "./alert-ingestion.types";
import { AlertObservationIdentityConflictError } from "./alert-ingestion.types";
import { AlertObservationIngestionService } from "./alert-observation-ingestion.service";
import type { AlertObservationRepository } from "./alert-observation.repository";

const VEHICLE_A = "00000000-0000-4000-8000-000000000081";
const VEHICLE_B = "00000000-0000-4000-8000-000000000082";
const BASE_MS = Date.parse("2026-08-08T10:00:00.000Z");

function input(vehicleId = VEHICLE_A, offsetMs = 0, speedKph: unknown = 72): AlertEvaluationObservation {
  return Object.freeze({ vehicleId, observedAt: new Date(BASE_MS + offsetMs).toISOString(), latitude: 49.2328, longitude: 28.481, speedKph });
}

function resultFor(observation: AlertEvaluationObservation, speedStatus: SpeedingDetectionResult["status"] = "PENDING", speedReason: SpeedingDetectionResult["reason"] = "ABOVE_THRESHOLD"): AlertEvaluationResult {
  const vehicleId = typeof observation.vehicleId === "string" ? observation.vehicleId : "";
  const observedAt = typeof observation.observedAt === "string" && Number.isFinite(Date.parse(observation.observedAt)) ? new Date(observation.observedAt).toISOString() : null;
  const speed = Object.freeze({ vehicleId, observedAt, status: speedStatus, reason: speedReason, zone: "CITY" as const, speedKph: typeof observation.speedKph === "number" && Number.isFinite(observation.speedKph) ? observation.speedKph : null, thresholdKph: 60, consecutiveCount: 1, confirmationRequired: 2, newlyConfirmed: speedStatus === "CONFIRMED" });
  const inactivity = Object.freeze({ vehicleId, observedAt, status: speedReason === "INVALID_OBSERVATION" ? "IGNORED" as const : "COLLECTING" as const, reason: speedReason === "INVALID_OBSERVATION" ? "INVALID_OBSERVATION" as const : "WINDOW_STARTED" as const, elapsedMinutes: speedReason === "INVALID_OBSERVATION" ? null : 0, traveledDistanceMeters: null, distanceThresholdMeters: speedReason === "INVALID_OBSERVATION" ? null : 300, durationThresholdMinutes: speedReason === "INVALID_OBSERVATION" ? null : 60, windowPointCount: speedReason === "INVALID_OBSERVATION" ? 0 : 1, newlyConfirmed: false });
  const speedProcessing = Object.freeze({ eventType: "SPEEDING" as const, detectorStatus: speed.status, action: "NONE" as const, persistenceOutcome: null, eventId: null, databaseWriteAttempted: false, lifecycleResult: null });
  const inactivityProcessing = Object.freeze({ eventType: "INACTIVITY" as const, detectorStatus: inactivity.status, action: "NONE" as const, persistenceOutcome: null, eventId: null, databaseWriteAttempted: false, lifecycleResult: null });
  return Object.freeze({ vehicleId, observedAt, speeding: Object.freeze({ detection: speed, processing: speedProcessing }), inactivity: Object.freeze({ detection: inactivity, processing: inactivityProcessing }) });
}

class MemoryRepository {
  public readonly rows: AlertEvaluationJournalObservation[] = [];
  public readonly order: string[] = [];
  public readonly replayCalls: { vehicleId: string; cutoff: Date; target: Date; speedingHistoryCount: number; ids: string[] }[] = [];
  public createCalls = 0;
  public markCalls = 0;
  public failMarkCount = 0;

  public seed(observation: AlertEvaluationObservation, processed: boolean, replayEligible: boolean | null = processed ? true : null): AlertEvaluationJournalObservation {
    const row = this.rowFrom(observation, `journal-${this.rows.length + 1}`, processed ? new Date(BASE_MS + 500) : null, replayEligible);
    this.rows.push(row); return row;
  }

  public async createOrFindObservation(observation: DurableAlertObservation): Promise<CreateOrFindAlertObservationResult> {
    this.createCalls += 1; this.order.push("journal");
    const existing = this.rows.find((row) => row.vehicleId === observation.vehicleId && row.observedAt.getTime() === observation.observedAtMs);
    if (existing !== undefined) {
      if (existing.latitude !== observation.latitude || existing.longitude !== observation.longitude || existing.speedKph !== observation.speedKph) throw new AlertObservationIdentityConflictError(observation.vehicleId, observation.observedAt);
      return Object.freeze({ outcome: "EXISTING", observation: existing });
    }
    const row = this.rowFrom(observation, `journal-${this.rows.length + 1}`, null, null);
    this.rows.push(row);
    return Object.freeze({ outcome: "CREATED", observation: row });
  }

  public async findPendingThrough(vehicleId: string, target: Date): Promise<readonly AlertEvaluationJournalObservation[]> {
    return this.rows.filter((row) => row.vehicleId === vehicleId && row.processedAt === null && row.observedAt <= target).sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  }

  public async findLatestReplayEligibleObservation(vehicleId: string): Promise<AlertEvaluationJournalObservation | null> {
    return this.rows.filter((row) => row.vehicleId === vehicleId && row.processedAt !== null && row.replayEligible === true).sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime()).at(-1) ?? null;
  }

  public async findReplayState(vehicleId: string, cutoff: Date, target: Date, speedingHistoryCount: number): Promise<readonly AlertEvaluationJournalObservation[]> {
    const eligible = this.rows.filter((row) => row.vehicleId === vehicleId && row.processedAt !== null && row.replayEligible === true && row.observedAt <= target).sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
    const recent = eligible.filter((row) => row.observedAt >= cutoff);
    const anchor = eligible.filter((row) => row.observedAt < cutoff).at(-1);
    const speeding = eligible.slice(-speedingHistoryCount);
    const rows = [...new Map([...(anchor === undefined ? [] : [anchor]), ...recent, ...speeding].map((row) => [row.id, row])).values()].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
    this.replayCalls.push({ vehicleId, cutoff, target, speedingHistoryCount, ids: rows.map((row) => row.id) });
    return rows;
  }

  public async markProcessed(id: string, replayEligible: boolean): Promise<void> {
    this.markCalls += 1; this.order.push("mark");
    if (this.failMarkCount > 0) { this.failMarkCount -= 1; throw new Error("mark processed failed"); }
    const index = this.rows.findIndex((row) => row.id === id);
    if (index < 0) throw new Error("row missing");
    const existing = this.rows[index]!;
    if (existing.processedAt !== null) {
      if (existing.replayEligible !== replayEligible) throw new Error("contradictory replay eligibility");
      return;
    }
    this.rows[index] = Object.freeze({ ...existing, processedAt: new Date(), replayEligible });
  }

  private rowFrom(observation: AlertEvaluationObservation | DurableAlertObservation, id: string, processedAt: Date | null, replayEligible: boolean | null): AlertEvaluationJournalObservation {
    const observedAt = new Date(observation.observedAt as string);
    return Object.freeze({ id, vehicleId: observation.vehicleId as string, observedAt, latitude: observation.latitude as number, longitude: observation.longitude as number, speedKph: observation.speedKph as number, processedAt, replayEligible, createdAt: new Date(BASE_MS - 1_000) });
  }
}

function settings(duration = 60, confirmationUpdates = 2): AlertRulesSettings {
  return Object.freeze({ speedRuleEnabled: true, inactivityRuleEnabled: true, citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedToleranceKph: 10, speedingConfirmationUpdates: confirmationUpdates, inactivityDistanceMeters: 300, inactivityDurationMinutes: duration, timezone: "UTC", cityGeofence: Object.freeze({ configured: true, geometry: null }), effectiveSpeedThresholds: Object.freeze({ cityKph: 60, outsideCityKph: 100 }), updatedAt: "2026-08-08T00:00:00.000Z" });
}

function noopProcessor(): AlertEventProcessorService {
  return {
    processSpeedingResult: async (detection: SpeedingDetectionResult): Promise<SpeedingAlertEventProcessingResult> => Object.freeze({ eventType: "SPEEDING", detectorStatus: detection.status, action: "NONE", persistenceOutcome: null, eventId: null, databaseWriteAttempted: false, lifecycleResult: null }),
    processInactivityResult: async (detection: InactivityDetectionResult): Promise<InactivityAlertEventProcessingResult> => Object.freeze({ eventType: "INACTIVITY", detectorStatus: detection.status, action: "NONE", persistenceOutcome: null, eventId: null, databaseWriteAttempted: false, lifecycleResult: null }),
  } as AlertEventProcessorService;
}

function fakeHarness(options: { repository?: MemoryRepository; evaluate?: (observation: AlertEvaluationObservation) => Promise<AlertEvaluationResult> } = {}) {
  const repository = options.repository ?? new MemoryRepository();
  const calls = { evaluate: [] as AlertEvaluationObservation[], prime: [] as AlertEvaluationObservation[], resets: [] as string[], clears: 0, settings: 0 };
  const evaluation = {
    evaluateObservation: async (observation: AlertEvaluationObservation) => { calls.evaluate.push(observation); repository.order.push("evaluate"); return options.evaluate ? options.evaluate(observation) : resultFor(observation); },
    primeObservation: async (observation: AlertEvaluationObservation) => { calls.prime.push(observation); return resultFor(observation); },
    resetVehicle: (vehicleId: string) => { calls.resets.push(vehicleId); },
    clearAll: () => { calls.clears += 1; },
  } as unknown as AlertEvaluationService;
  const alertSettings = { getSettings: async () => { calls.settings += 1; return settings(); } } as AlertSettingsService;
  const service = new AlertObservationIngestionService(repository as unknown as AlertObservationRepository, evaluation, alertSettings);
  return { service, repository, calls };
}

test("invalid speed is neither journaled nor statefully accepted", async () => {
  const { service, repository, calls } = fakeHarness();
  const outcome = await service.ingestObservation(input(VEHICLE_A, 0, Number.NaN));
  assert.equal(outcome.journalOutcome, "INVALID"); assert.equal(outcome.processingPerformed, false); assert.equal(repository.createCalls, 0); assert.equal(calls.evaluate.length, 1); assert.equal(calls.settings, 0);
});

test("invalid coordinate is not journaled", async () => {
  const { service, repository } = fakeHarness();
  const outcome = await service.ingestObservation(Object.freeze({ ...input(), latitude: 91 }));
  assert.equal(outcome.journalOutcome, "INVALID"); assert.equal(repository.createCalls, 0);
});

test("invalid timestamp is not journaled", async () => {
  const { service, repository } = fakeHarness();
  const outcome = await service.ingestObservation(Object.freeze({ ...input(), observedAt: "not-a-date" }));
  assert.equal(outcome.journalOutcome, "INVALID"); assert.equal(repository.createCalls, 0);
});

test("malformed UUID is rejected at ingestion without Prisma, settings, or detector calls", async () => {
  const { service, repository, calls } = fakeHarness();
  const outcome = await service.ingestObservation(input("vehicle-not-a-uuid"));
  assert.equal(outcome.journalOutcome, "INVALID"); assert.equal(outcome.evaluation, null); assert.equal(repository.createCalls, 0); assert.equal(calls.evaluate.length, 0); assert.equal(calls.settings, 0);
});

test("valid observation is journaled before bootstrap or detector evaluation", async () => {
  const { service, repository } = fakeHarness();
  const outcome = await service.ingestObservation(input());
  assert.equal(outcome.journalOutcome, "CREATED"); assert.deepEqual(repository.order, ["journal", "evaluate", "mark"]); assert.equal(outcome.processed, true);
});

test("identical duplicate is existing while pending and skips all evaluation once processed", async () => {
  const { service, repository, calls } = fakeHarness();
  const first = await service.ingestObservation(input());
  const second = await service.ingestObservation(input());
  assert.equal(first.journalOutcome, "CREATED"); assert.equal(second.journalOutcome, "ALREADY_PROCESSED"); assert.equal(second.processingPerformed, false); assert.equal(second.evaluation, null); assert.equal(calls.evaluate.length, 1); assert.equal(repository.rows.length, 1);
});

test("same identity with conflicting payload is rejected without detector mutation", async () => {
  const { service, calls } = fakeHarness(); await service.ingestObservation(input());
  await assert.rejects(service.ingestObservation(Object.freeze({ ...input(), speedKph: 73 })), AlertObservationIdentityConflictError);
  assert.equal(calls.evaluate.length, 1);
});

test("ALREADY_EXISTS and NOOP evaluation outcomes both reach the processed marker", async () => {
  for (const persistenceOutcome of ["ALREADY_EXISTS", "NOOP"] as const) {
    const repository = new MemoryRepository();
    const { service } = fakeHarness({ repository, evaluate: async (observation) => {
      const base = resultFor(observation, "CONFIRMED");
      return Object.freeze({ ...base, speeding: Object.freeze({ ...base.speeding, processing: Object.freeze({ ...base.speeding.processing, action: "OPEN" as const, persistenceOutcome, databaseWriteAttempted: true }) }) });
    } });
    assert.equal((await service.ingestObservation(input())).processed, true); assert.equal(repository.markCalls, 1);
  }
});

test("same vehicle work is strictly serialized and the queue cleans up", async () => {
  let releaseFirst!: () => void; let started = 0;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const { service } = fakeHarness({ evaluate: async (observation) => { started += 1; if (started === 1) await firstGate; return resultFor(observation); } });
  const first = service.ingestObservation(input(VEHICLE_A, 0));
  await new Promise((resolve) => setImmediate(resolve));
  const second = service.ingestObservation(input(VEHICLE_A, 1_000));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started, 1); assert.equal(service.activeVehicleQueueCount(), 1);
  releaseFirst(); await Promise.all([first, second]);
  assert.equal(started, 2); assert.equal(service.activeVehicleQueueCount(), 0);
});

test("different vehicles progress independently", async () => {
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); const started: string[] = [];
  const { service } = fakeHarness({ evaluate: async (observation) => { started.push(observation.vehicleId as string); await gate; return resultFor(observation); } });
  const first = service.ingestObservation(input(VEHICLE_A)); const second = service.ingestObservation(input(VEHICLE_B));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(new Set(started), new Set([VEHICLE_A, VEHICLE_B])); assert.equal(service.activeVehicleQueueCount(), 2);
  release(); await Promise.all([first, second]); assert.equal(service.activeVehicleQueueCount(), 0);
});

test("rejection cleans the queue and does not poison the next task", async () => {
  let attempts = 0;
  const { service } = fakeHarness({ evaluate: async (observation) => { attempts += 1; if (attempts === 1) throw new Error("processor failed"); return resultFor(observation); } });
  await assert.rejects(service.ingestObservation(input()), /processor failed/); assert.equal(service.activeVehicleQueueCount(), 0); assert.equal(service.initializedVehicleCount(), 0);
  const retry = await service.ingestObservation(input()); assert.equal(retry.processed, true); assert.equal(attempts, 2); assert.equal(service.activeVehicleQueueCount(), 0);
});

test("multiple pending predecessors drain oldest to newest before the current target", async () => {
  const repository = new MemoryRepository(); repository.seed(input(VEHICLE_A, 1_000), false); repository.seed(input(VEHICLE_A, 2_000), false);
  const processedOrder: number[] = [];
  const { service } = fakeHarness({ repository, evaluate: async (observation) => { processedOrder.push(new Date(observation.observedAt as string).getTime()); return resultFor(observation); } });
  const outcome = await service.ingestObservation(input(VEHICLE_A, 3_000));
  assert.deepEqual(processedOrder, [BASE_MS + 1_000, BASE_MS + 2_000, BASE_MS + 3_000]); assert.equal(outcome.processed, true);
  assert.equal(repository.rows.every((row) => row.processedAt !== null), true);
});

test("failure while draining the oldest pending row blocks every newer evaluation and marker", async () => {
  const repository = new MemoryRepository(); repository.seed(input(VEHICLE_A, 1_000), false); repository.seed(input(VEHICLE_A, 2_000), false);
  const evaluated: number[] = [];
  const { service } = fakeHarness({ repository, evaluate: async (observation) => { evaluated.push(new Date(observation.observedAt as string).getTime()); throw new Error("oldest pending failed again"); } });
  await assert.rejects(service.ingestObservation(input(VEHICLE_A, 3_000)), /oldest pending failed again/);
  assert.deepEqual(evaluated, [BASE_MS + 1_000]); assert.equal(repository.markCalls, 0); assert.equal(repository.rows.every((row) => row.processedAt === null), true);
});

test("no processed history initializes without settings or prime rows and processes the first target normally", async () => {
  const { service, repository, calls } = fakeHarness();
  const outcome = await service.ingestObservation(input());
  assert.equal(outcome.evaluation?.speeding.detection.status, "PENDING"); assert.equal(calls.prime.length, 0); assert.equal(calls.settings, 0); assert.equal(repository.replayCalls.length, 0); assert.equal(service.initializedVehicleCount(), 1);
});

test("fresh service is lazy, uses current duration cutoff, replays only processed predecessors, and excludes target", async () => {
  const repository = new MemoryRepository();
  const anchor = repository.seed(input(VEHICLE_A, -7_200_000), true);
  const pending = repository.seed(input(VEHICLE_A, 60_000), false);
  const recent = repository.seed(input(VEHICLE_A, -900_000), true);
  const target = repository.seed(input(VEHICLE_A, 0), false);
  const calls = { primes: [] as string[], snapshots: [] as AlertRulesSettings[], resets: 0, settings: 0 }; const snapshot = settings(45);
  const evaluation = { evaluateObservation: async (value: AlertEvaluationObservation) => resultFor(value), primeObservation: async (value: AlertEvaluationObservation, used: AlertRulesSettings) => { calls.primes.push(new Date(value.observedAt as string).toISOString()); calls.snapshots.push(used); return resultFor(value); }, resetVehicle: () => { calls.resets += 1; }, clearAll() {} } as unknown as AlertEvaluationService;
  const service = new AlertObservationIngestionService(repository as unknown as AlertObservationRepository, evaluation, { getSettings: async () => { calls.settings += 1; return snapshot; } } as AlertSettingsService);
  assert.equal(calls.settings, 0); assert.equal(repository.replayCalls.length, 0);
  await service.ingestObservation(input());
  assert.equal(calls.settings, 1); assert.equal(repository.replayCalls[0]!.target.getTime(), recent.observedAt.getTime()); assert.equal(repository.replayCalls[0]!.cutoff.getTime(), recent.observedAt.getTime() - 45 * 60_000);
  assert.deepEqual(repository.replayCalls[0]!.ids, [anchor.id, recent.id]); assert.equal(repository.replayCalls[0]!.ids.includes(pending.id), false); assert.equal(repository.replayCalls[0]!.ids.includes(target.id), false);
  assert.deepEqual(calls.primes, [anchor.observedAt.toISOString(), recent.observedAt.toISOString()]); assert.equal(calls.snapshots.every((used) => used === snapshot), true); assert.equal(calls.resets, 1);
});

function productionRecoveryHarness(failProcessedMarker: boolean) {
  const repository = new MemoryRepository();
  repository.seed(input(VEHICLE_A, 0, 72), true);
  if (failProcessedMarker) repository.failMarkCount = 1;
  const snapshot = settings();
  const alertSettings = { getSettings: async () => snapshot } as AlertSettingsService;
  const geofence = { classifyPointWithSettings: () => Object.freeze({ classification: "INSIDE", speedLimitZone: "CITY", geofenceConfigured: true }) } as unknown as CityGeofenceService;
  const speedingDetector = new SpeedingDetectorService(alertSettings, geofence, new SpeedingDetectorStateMachine());
  const inactivityDetector = new InactivityDetectorService(alertSettings, new InactivityDetectorStateMachine());
  const confirmations: SpeedingDetectionResult[] = []; const speedingDetections: SpeedingDetectionResult[] = []; const receipts = new Set<string>(); let failPersistence = !failProcessedMarker; let eventCount = 0;
  const processor = {
    processSpeedingResult: async (detection: SpeedingDetectionResult): Promise<SpeedingAlertEventProcessingResult> => {
      speedingDetections.push(detection);
      if (detection.status !== "CONFIRMED") return Object.freeze({ eventType: "SPEEDING", detectorStatus: detection.status, action: "NONE", persistenceOutcome: null, eventId: null, databaseWriteAttempted: false, lifecycleResult: null });
      confirmations.push(detection);
      if (failPersistence) { failPersistence = false; throw new Error("event persistence failed"); }
      const key = `${detection.vehicleId}:${detection.observedAt}`; const existing = receipts.has(key); if (!existing) { receipts.add(key); eventCount += 1; }
      const lifecycleResult = Object.freeze({ outcome: existing ? "ALREADY_EXISTS" as const : "CREATED" as const, eventId: "event-1" });
      return Object.freeze({ eventType: "SPEEDING", detectorStatus: detection.status, action: "OPEN", persistenceOutcome: lifecycleResult.outcome, eventId: "event-1", databaseWriteAttempted: true, lifecycleResult });
    },
    processInactivityResult: async (detection: InactivityDetectionResult): Promise<InactivityAlertEventProcessingResult> => Object.freeze({ eventType: "INACTIVITY", detectorStatus: detection.status, action: "NONE", persistenceOutcome: null, eventId: null, databaseWriteAttempted: false, lifecycleResult: null }),
  } as AlertEventProcessorService;
  const evaluation = new AlertEvaluationService(speedingDetector, inactivityDetector, processor);
  const service = new AlertObservationIngestionService(repository as unknown as AlertObservationRepository, evaluation, alertSettings);
  return { service, repository, speedingDetector, inactivityDetector, confirmations, speedingDetections, get eventCount() { return eventCount; } };
}

test("event persistence failure leaves target pending, resets both detectors, and retry reproduces CONFIRMED", async () => {
  const harness = productionRecoveryHarness(false); const target = input(VEHICLE_A, 60_000, 72);
  await assert.rejects(harness.service.ingestObservation(target), /event persistence failed/);
  assert.equal(harness.repository.rows.find((row) => row.observedAt.getTime() === BASE_MS + 60_000)?.processedAt, null);
  assert.equal(harness.speedingDetector.stateCount(), 0); assert.equal(harness.inactivityDetector.stateCount(), 0); assert.equal(harness.service.initializedVehicleCount(), 0);
  assert.deepEqual(harness.repository.replayCalls.at(-1)?.ids, ["journal-1"]);
  const retry = await harness.service.ingestObservation(target);
  assert.equal(retry.journalOutcome, "EXISTING"); assert.equal(retry.evaluation?.speeding.detection.status, "CONFIRMED"); assert.notEqual(retry.evaluation?.speeding.detection.reason, "OUT_OF_ORDER"); assert.equal(retry.processed, true);
  assert.deepEqual(harness.repository.replayCalls.at(-1)?.ids, ["journal-1"]);
  assert.deepEqual(harness.confirmations.map((item) => item.status), ["CONFIRMED", "CONFIRMED"]);
  assert.equal(harness.repository.rows.find((row) => row.observedAt.getTime() === BASE_MS + 60_000)?.replayEligible, true);
});

test("event success plus processedAt failure replays through receipt dedupe and eventually marks processed", async () => {
  const harness = productionRecoveryHarness(true); const target = input(VEHICLE_A, 60_000, 72);
  await assert.rejects(harness.service.ingestObservation(target), /mark processed failed/);
  assert.equal(harness.eventCount, 1); assert.equal(harness.speedingDetector.stateCount(), 0); assert.equal(harness.inactivityDetector.stateCount(), 0);
  const retry = await harness.service.ingestObservation(target);
  assert.equal(retry.evaluation?.speeding.processing.persistenceOutcome, "ALREADY_EXISTS"); assert.equal(harness.eventCount, 1); assert.equal(harness.repository.markCalls, 2); assert.equal(retry.processed, true);
  assert.equal(harness.repository.rows.find((row) => row.observedAt.getTime() === BASE_MS + 60_000)?.replayEligible, true);
});

test("newer speeding observation automatically retries and processes failed CONFIRMED predecessor first", async () => {
  const harness = productionRecoveryHarness(false); const failed = input(VEHICLE_A, 60_000, 72); const newer = input(VEHICLE_A, 120_000, 72);
  await assert.rejects(harness.service.ingestObservation(failed), /event persistence failed/);
  const outcome = await harness.service.ingestObservation(newer);
  assert.deepEqual(harness.speedingDetections.slice(-2).map((item) => [item.observedAt, item.status]), [[failed.observedAt, "CONFIRMED"], [newer.observedAt, "ACTIVE"]]);
  const ordered = [...harness.repository.rows].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  assert.equal(ordered.every((row) => row.processedAt !== null), true); assert.equal(outcome.evaluation?.speeding.detection.status, "ACTIVE");
  assert.equal(ordered.every((row) => row.replayEligible === true), true);
  assert.equal(ordered.some((row, index) => row.processedAt === null && ordered.slice(index + 1).some((newerRow) => newerRow.processedAt !== null)), false);
});

test("newer movement drains failed inactivity CONFIRMED predecessor before CLEAR, preserving the event", async () => {
  const repository = new MemoryRepository(); const snapshot = settings();
  repository.seed(input(VEHICLE_A, 0, 0), true); repository.seed(input(VEHICLE_A, 59 * 60_000, 0), true);
  const alertSettings = { getSettings: async () => snapshot } as AlertSettingsService;
  const geofence = { classifyPointWithSettings: () => Object.freeze({ classification: "INSIDE", speedLimitZone: "CITY", geofenceConfigured: true }) } as unknown as CityGeofenceService;
  const speedingDetector = new SpeedingDetectorService(alertSettings, geofence, new SpeedingDetectorStateMachine());
  const inactivityDetector = new InactivityDetectorService(alertSettings, new InactivityDetectorStateMachine());
  const inactivityOrder: { observedAt: string | null; status: string }[] = []; let failOnce = true; let confirmedEvents = 0; let resolvedEvents = 0;
  const processor = {
    processSpeedingResult: async (detection: SpeedingDetectionResult): Promise<SpeedingAlertEventProcessingResult> => Object.freeze({ eventType: "SPEEDING", detectorStatus: detection.status, action: "NONE", persistenceOutcome: null, eventId: null, databaseWriteAttempted: false, lifecycleResult: null }),
    processInactivityResult: async (detection: InactivityDetectionResult): Promise<InactivityAlertEventProcessingResult> => {
      inactivityOrder.push({ observedAt: detection.observedAt, status: detection.status });
      if (detection.status === "CONFIRMED") {
        if (failOnce) { failOnce = false; throw new Error("inactivity event database failure"); }
        confirmedEvents += 1; const lifecycleResult = Object.freeze({ outcome: "CREATED" as const, eventId: "inactivity-event" });
        return Object.freeze({ eventType: "INACTIVITY", detectorStatus: detection.status, action: "OPEN", persistenceOutcome: "CREATED", eventId: "inactivity-event", databaseWriteAttempted: true, lifecycleResult });
      }
      if (detection.status === "CLEAR") {
        resolvedEvents += 1; const lifecycleResult = Object.freeze({ outcome: "RESOLVED" as const, eventId: "inactivity-event" });
        return Object.freeze({ eventType: "INACTIVITY", detectorStatus: detection.status, action: "RESOLVE", persistenceOutcome: "RESOLVED", eventId: "inactivity-event", databaseWriteAttempted: true, lifecycleResult });
      }
      return Object.freeze({ eventType: "INACTIVITY", detectorStatus: detection.status, action: "NONE", persistenceOutcome: null, eventId: null, databaseWriteAttempted: false, lifecycleResult: null });
    },
  } as AlertEventProcessorService;
  const service = new AlertObservationIngestionService(repository as unknown as AlertObservationRepository, new AlertEvaluationService(speedingDetector, inactivityDetector, processor), alertSettings);
  const failed = input(VEHICLE_A, 60 * 60_000, 0); const moved = Object.freeze({ ...input(VEHICLE_A, 61 * 60_000, 0), latitude: 49.2428 });
  await assert.rejects(service.ingestObservation(failed), /inactivity event database failure/);
  const outcome = await service.ingestObservation(moved);
  assert.deepEqual(inactivityOrder.slice(-2), [{ observedAt: failed.observedAt as string, status: "CONFIRMED" }, { observedAt: moved.observedAt as string, status: "CLEAR" }]);
  assert.equal(confirmedEvents, 1); assert.equal(resolvedEvents, 1); assert.equal(outcome.evaluation?.inactivity.detection.status, "CLEAR");
  assert.equal(repository.rows.filter((row) => row.observedAt >= new Date(failed.observedAt as string)).every((row) => row.processedAt !== null), true);
});

test("restart replay unions the latest 10 speeding rows with a one-minute inactivity window and restores ACTIVE", async () => {
  const repository = new MemoryRepository(); const snapshot = settings(1, 10);
  for (let minute = 0; minute < 10; minute += 1) repository.seed(input(VEHICLE_A, minute * 60_000, 72), true);
  const alertSettings = { getSettings: async () => snapshot } as AlertSettingsService;
  const geofence = { classifyPointWithSettings: () => Object.freeze({ classification: "INSIDE", speedLimitZone: "CITY", geofenceConfigured: true }) } as unknown as CityGeofenceService;
  const speedingDetector = new SpeedingDetectorService(alertSettings, geofence, new SpeedingDetectorStateMachine());
  const inactivityDetector = new InactivityDetectorService(alertSettings, new InactivityDetectorStateMachine());
  const processor = {
    processSpeedingResult: async (detection: SpeedingDetectionResult): Promise<SpeedingAlertEventProcessingResult> => Object.freeze({ eventType: "SPEEDING", detectorStatus: detection.status, action: "NONE", persistenceOutcome: null, eventId: null, databaseWriteAttempted: false, lifecycleResult: null }),
    processInactivityResult: async (detection: InactivityDetectionResult): Promise<InactivityAlertEventProcessingResult> => Object.freeze({ eventType: "INACTIVITY", detectorStatus: detection.status, action: "NONE", persistenceOutcome: null, eventId: null, databaseWriteAttempted: false, lifecycleResult: null }),
  } as AlertEventProcessorService;
  const service = new AlertObservationIngestionService(repository as unknown as AlertObservationRepository, new AlertEvaluationService(speedingDetector, inactivityDetector, processor), alertSettings);
  const target = input(VEHICLE_A, 10 * 60_000, 72); const outcome = await service.ingestObservation(target);
  assert.equal(outcome.evaluation?.speeding.detection.status, "ACTIVE"); assert.equal(repository.replayCalls[0]?.speedingHistoryCount, 10);
  assert.deepEqual(repository.replayCalls[0]?.ids, repository.rows.slice(0, 10).map((row) => row.id)); assert.equal(new Set(repository.replayCalls[0]?.ids).size, 10);
});

test("second restart excludes a completed late speeding row and preserves ACTIVE frontier", async () => {
  const repository = new MemoryRepository(); const snapshot = settings();
  repository.seed(input(VEHICLE_A, 9 * 60_000, 72), true); repository.seed(input(VEHICLE_A, 10 * 60_000, 72), true);
  const alertSettings = { getSettings: async () => snapshot } as AlertSettingsService;
  const geofence = { classifyPointWithSettings: () => Object.freeze({ classification: "INSIDE", speedLimitZone: "CITY", geofenceConfigured: true }) } as unknown as CityGeofenceService;
  const firstService = new AlertObservationIngestionService(repository as unknown as AlertObservationRepository, new AlertEvaluationService(
    new SpeedingDetectorService(alertSettings, geofence, new SpeedingDetectorStateMachine()),
    new InactivityDetectorService(alertSettings, new InactivityDetectorStateMachine()),
    noopProcessor(),
  ), alertSettings);
  const lateInput = input(VEHICLE_A, 9 * 60_000 + 30_000, 10);
  const late = await firstService.ingestObservation(lateInput);
  assert.equal(late.evaluation?.speeding.detection.status, "IGNORED"); assert.equal(late.evaluation?.speeding.detection.reason, "OUT_OF_ORDER"); assert.equal(late.evaluation?.speeding.processing.action, "NONE"); assert.equal(late.processed, true);
  assert.equal(repository.replayCalls[0]?.target.getTime(), BASE_MS + 10 * 60_000);
  const lateRow = repository.rows.find((row) => row.observedAt.getTime() === BASE_MS + 9 * 60_000 + 30_000)!;
  assert.equal(lateRow.replayEligible, false);
  const duplicate = await firstService.ingestObservation(lateInput);
  assert.equal(duplicate.journalOutcome, "ALREADY_PROCESSED"); assert.equal(duplicate.processingPerformed, false); assert.equal(lateRow.replayEligible, false);

  const secondService = new AlertObservationIngestionService(repository as unknown as AlertObservationRepository, new AlertEvaluationService(
    new SpeedingDetectorService(alertSettings, geofence, new SpeedingDetectorStateMachine()),
    new InactivityDetectorService(alertSettings, new InactivityDetectorStateMachine()),
    noopProcessor(),
  ), alertSettings);
  const future = await secondService.ingestObservation(input(VEHICLE_A, 11 * 60_000, 72));
  assert.equal(future.evaluation?.speeding.detection.status, "ACTIVE");
  assert.equal(repository.replayCalls.at(-1)?.ids.includes(lateRow.id), false);
});

test("second restart excludes a completed disruptive late row and preserves inactivity ACTIVE", async () => {
  const repository = new MemoryRepository(); const snapshot = settings();
  repository.seed(input(VEHICLE_A, 0, 0), true); repository.seed(input(VEHICLE_A, 59 * 60_000, 0), true); repository.seed(input(VEHICLE_A, 60 * 60_000, 0), true); repository.seed(input(VEHICLE_A, 61 * 60_000, 0), true);
  const alertSettings = { getSettings: async () => snapshot } as AlertSettingsService;
  const geofence = { classifyPointWithSettings: () => Object.freeze({ classification: "INSIDE", speedLimitZone: "CITY", geofenceConfigured: true }) } as unknown as CityGeofenceService;
  const firstService = new AlertObservationIngestionService(repository as unknown as AlertObservationRepository, new AlertEvaluationService(
    new SpeedingDetectorService(alertSettings, geofence, new SpeedingDetectorStateMachine()),
    new InactivityDetectorService(alertSettings, new InactivityDetectorStateMachine()),
    noopProcessor(),
  ), alertSettings);
  const lateInput = Object.freeze({ ...input(VEHICLE_A, 30 * 60_000, 0), latitude: 49.2428 });
  const late = await firstService.ingestObservation(lateInput);
  assert.equal(late.evaluation?.inactivity.detection.status, "IGNORED"); assert.equal(late.evaluation?.inactivity.detection.reason, "OUT_OF_ORDER"); assert.equal(late.evaluation?.inactivity.processing.action, "NONE");
  const lateRow = repository.rows.find((row) => row.observedAt.getTime() === BASE_MS + 30 * 60_000)!;
  assert.equal(lateRow.replayEligible, false);

  const secondService = new AlertObservationIngestionService(repository as unknown as AlertObservationRepository, new AlertEvaluationService(
    new SpeedingDetectorService(alertSettings, geofence, new SpeedingDetectorStateMachine()),
    new InactivityDetectorService(alertSettings, new InactivityDetectorStateMachine()),
    noopProcessor(),
  ), alertSettings);
  const future = await secondService.ingestObservation(input(VEHICLE_A, 62 * 60_000, 0));
  assert.equal(future.evaluation?.inactivity.detection.status, "ACTIVE"); assert.equal(future.evaluation?.inactivity.detection.reason, "INACTIVITY_ACTIVE");
  assert.equal(repository.replayCalls.at(-1)?.ids.includes(lateRow.id), false);
});

test("fresh processed duplicate skips bootstrap and the next new row bootstraps latest state lazily", async () => {
  const repository = new MemoryRepository(); repository.seed(input(), true); const { service, calls } = fakeHarness({ repository });
  const duplicate = await service.ingestObservation(input());
  assert.equal(duplicate.journalOutcome, "ALREADY_PROCESSED"); assert.equal(calls.settings, 0); assert.equal(calls.prime.length, 0); assert.equal(service.initializedVehicleCount(), 0);
  await service.ingestObservation(input(VEHICLE_A, 60_000));
  assert.equal(calls.settings, 1); assert.equal(calls.prime.length, 1); assert.equal(service.initializedVehicleCount(), 1);
});

test("late older durable observation preserves OUT_OF_ORDER/NONE semantics and is marked processed", async () => {
  const harness = productionRecoveryHarness(false);
  // Disable the injected first failure for this scenario by consuming it at a newer confirmation.
  await assert.rejects(harness.service.ingestObservation(input(VEHICLE_A, 60_000, 72)), /event persistence failed/);
  await harness.service.ingestObservation(input(VEHICLE_A, 60_000, 72));
  const late = await harness.service.ingestObservation(input(VEHICLE_A, 30_000, 10));
  assert.equal(late.evaluation?.speeding.detection.reason, "OUT_OF_ORDER"); assert.equal(late.evaluation?.speeding.processing.action, "NONE"); assert.equal(late.processed, true);
  const lateRow = harness.repository.rows.find((row) => row.observedAt.getTime() === BASE_MS + 30_000)!;
  assert.equal(lateRow.replayEligible, false);
  const duplicate = await harness.service.ingestObservation(input(VEHICLE_A, 30_000, 10));
  assert.equal(duplicate.journalOutcome, "ALREADY_PROCESSED"); assert.equal(duplicate.processingPerformed, false); assert.equal(lateRow.replayEligible, false);
});

test("resetVehicle and clearAll reset only memory and never delete journal rows", async () => {
  const { service, repository, calls } = fakeHarness(); await service.ingestObservation(input()); const count = repository.rows.length;
  service.resetVehicle(VEHICLE_A); assert.equal(service.initializedVehicleCount(), 0); assert.equal(repository.rows.length, count);
  service.clearAll(); assert.equal(service.activeVehicleQueueCount(), 0); assert.equal(service.initializedVehicleCount(), 0); assert.equal(repository.rows.length, count); assert.equal(calls.clears, 1);
});
