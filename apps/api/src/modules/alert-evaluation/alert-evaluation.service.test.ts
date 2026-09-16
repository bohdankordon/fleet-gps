import assert from "node:assert/strict";
import test from "node:test";
import type { AlertRulesSettings, AlertSettingsService } from "../alert-settings";
import type {
  AlertEventLifecycleResult,
  InactivityAlertEventProcessingResult,
  SpeedingAlertEventProcessingResult,
} from "../alert-events";
import { AlertEventProcessorService } from "../alert-events";
import type { AlertEventsLifecycleService } from "../alert-events/alert-events-lifecycle.service";
import type { CityGeofenceService } from "../city-geofence";
import type { InactivityDetectionResult } from "../inactivity-detector";
import { InactivityDetectorService, InactivityDetectorStateMachine } from "../inactivity-detector";
import type { SpeedingDetectionResult } from "../speeding-detector";
import { SpeedingDetectorService, SpeedingDetectorStateMachine } from "../speeding-detector";
import { AlertEvaluationService } from "./alert-evaluation.service";
import type { AlertEvaluationObservation } from "./alert-evaluation.types";

const VEHICLE_ID = "00000000-0000-4000-8000-000000000061";
const OBSERVED_AT = "2026-08-08T10:00:00.000Z";
const OBSERVATION: AlertEvaluationObservation = Object.freeze({
  vehicleId: VEHICLE_ID,
  observedAt: OBSERVED_AT,
  latitude: 49.2328,
  longitude: 28.481,
  speedKph: 72.125,
});

function speeding(overrides: Partial<SpeedingDetectionResult> = {}): SpeedingDetectionResult {
  return Object.freeze({ vehicleId: VEHICLE_ID, observedAt: OBSERVED_AT, status: "PENDING", reason: "ABOVE_THRESHOLD", zone: "CITY", speedKph: 72.125, thresholdKph: 60, consecutiveCount: 1, confirmationRequired: 2, newlyConfirmed: false, ...overrides });
}

function inactivity(overrides: Partial<InactivityDetectionResult> = {}): InactivityDetectionResult {
  return Object.freeze({ vehicleId: VEHICLE_ID, observedAt: OBSERVED_AT, status: "COLLECTING", reason: "WINDOW_STARTED", elapsedMinutes: 0, traveledDistanceMeters: null, distanceThresholdMeters: 300, durationThresholdMinutes: 60, windowPointCount: 1, newlyConfirmed: false, ...overrides });
}

function speedingProcessing(detection: SpeedingDetectionResult, overrides: Partial<SpeedingAlertEventProcessingResult> = {}): SpeedingAlertEventProcessingResult {
  return Object.freeze({ eventType: "SPEEDING", detectorStatus: detection.status, action: "NONE", persistenceOutcome: null, eventId: null, databaseWriteAttempted: false, lifecycleResult: null, ...overrides });
}

function inactivityProcessing(detection: InactivityDetectionResult, overrides: Partial<InactivityAlertEventProcessingResult> = {}): InactivityAlertEventProcessingResult {
  return Object.freeze({ eventType: "INACTIVITY", detectorStatus: detection.status, action: "NONE", persistenceOutcome: null, eventId: null, databaseWriteAttempted: false, lifecycleResult: null, ...overrides });
}

type SetupOptions = Readonly<{
  speedingDetection?: SpeedingDetectionResult;
  inactivityDetection?: InactivityDetectionResult;
  speedingProcessing?: SpeedingAlertEventProcessingResult;
  inactivityProcessing?: InactivityAlertEventProcessingResult;
  speedingDetectorError?: Error;
  inactivityDetectorError?: Error;
  speedingProcessorError?: Error;
  inactivityProcessorError?: Error;
}>;

function setup(options: SetupOptions = {}) {
  const order: string[] = [];
  const received = { speeding: [] as AlertEvaluationObservation[], inactivity: [] as AlertEvaluationObservation[] };
  const resets = { speeding: [] as string[], inactivity: [] as string[], speedingClear: 0, inactivityClear: 0 };
  const speedDetection = options.speedingDetection ?? speeding();
  const idleDetection = options.inactivityDetection ?? inactivity();
  const speedProcessing = options.speedingProcessing ?? speedingProcessing(speedDetection);
  const idleProcessing = options.inactivityProcessing ?? inactivityProcessing(idleDetection);
  const speedingDetector = {
    detect: async (input: AlertEvaluationObservation) => { order.push("speeding detector"); received.speeding.push(input); if (options.speedingDetectorError) throw options.speedingDetectorError; return speedDetection; },
    resetVehicle: (vehicleId: string) => { resets.speeding.push(vehicleId); },
    clearAll: () => { resets.speedingClear += 1; },
  } as unknown as SpeedingDetectorService;
  const inactivityDetector = {
    detect: async (input: AlertEvaluationObservation) => { order.push("inactivity detector"); received.inactivity.push(input); if (options.inactivityDetectorError) throw options.inactivityDetectorError; return idleDetection; },
    resetVehicle: (vehicleId: string) => { resets.inactivity.push(vehicleId); },
    clearAll: () => { resets.inactivityClear += 1; },
  } as unknown as InactivityDetectorService;
  const processor = {
    processSpeedingResult: async () => { order.push("speeding processor"); if (options.speedingProcessorError) throw options.speedingProcessorError; return speedProcessing; },
    processInactivityResult: async () => { order.push("inactivity processor"); if (options.inactivityProcessorError) throw options.inactivityProcessorError; return idleProcessing; },
  } as unknown as AlertEventProcessorService;
  return { service: new AlertEvaluationService(speedingDetector, inactivityDetector, processor), order, received, resets };
}

function productionProcessor(outcome: AlertEventLifecycleResult = { outcome: "CREATED", eventId: "event-1" }) {
  const calls: string[] = [];
  const invoke = async (method: string): Promise<AlertEventLifecycleResult> => { calls.push(method); return outcome; };
  const lifecycle = {
    openSpeedingEvent: () => invoke("openSpeedingEvent"), updateSpeedingEvent: () => invoke("updateSpeedingEvent"), resolveSpeedingEvent: () => invoke("resolveSpeedingEvent"),
    openInactivityEvent: () => invoke("openInactivityEvent"), updateInactivityEvent: () => invoke("updateInactivityEvent"), resolveInactivityEvent: () => invoke("resolveInactivityEvent"),
  } as unknown as AlertEventsLifecycleService;
  return { processor: new AlertEventProcessorService(lifecycle), calls };
}

function detectorSettings(): AlertRulesSettings {
  return Object.freeze({ speedRuleEnabled: true, inactivityRuleEnabled: true, citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedToleranceKph: 10, speedingConfirmationUpdates: 2, inactivityDistanceMeters: 300, inactivityDurationMinutes: 60, timezone: "UTC", cityGeofence: Object.freeze({ configured: true, geometry: null }), effectiveSpeedThresholds: Object.freeze({ cityKph: 60, outsideCityKph: 100 }), updatedAt: "2026-08-08T00:00:00.000Z" });
}

function productionEvaluation() {
  const lifecycleCalls: string[] = [];
  const settings = { getSettings: async () => detectorSettings() } as unknown as AlertSettingsService;
  const geofence = { classifyPointWithSettings: () => Object.freeze({ classification: "INSIDE", speedLimitZone: "CITY", geofenceConfigured: true }) } as unknown as CityGeofenceService;
  const speedingDetector = new SpeedingDetectorService(settings, geofence, new SpeedingDetectorStateMachine());
  const inactivityDetector = new InactivityDetectorService(settings, new InactivityDetectorStateMachine());
  const invoke = async (method: string): Promise<AlertEventLifecycleResult> => {
    lifecycleCalls.push(method);
    if (method.startsWith("open")) return Object.freeze({ outcome: "CREATED", eventId: `${method}-event` });
    if (method.startsWith("update")) return Object.freeze({ outcome: "UPDATED", eventId: `${method}-event` });
    return Object.freeze({ outcome: "RESOLVED", eventId: `${method}-event` });
  };
  const lifecycle = {
    openSpeedingEvent: () => invoke("openSpeedingEvent"), updateSpeedingEvent: () => invoke("updateSpeedingEvent"), resolveSpeedingEvent: () => invoke("resolveSpeedingEvent"),
    openInactivityEvent: () => invoke("openInactivityEvent"), updateInactivityEvent: () => invoke("updateInactivityEvent"), resolveInactivityEvent: () => invoke("resolveInactivityEvent"),
  } as unknown as AlertEventsLifecycleService;
  const service = new AlertEvaluationService(speedingDetector, inactivityDetector, new AlertEventProcessorService(lifecycle));
  return { service, speedingDetector, inactivityDetector, lifecycleCalls };
}

function observationAt(offsetMs: number, speedKph: number, coordinates: Readonly<{ latitude: number; longitude: number }> = { latitude: 49.2328, longitude: 28.481 }): AlertEvaluationObservation {
  return Object.freeze({ vehicleId: VEHICLE_ID, observedAt: new Date(Date.parse(OBSERVED_AT) + offsetMs).toISOString(), latitude: coordinates.latitude, longitude: coordinates.longitude, speedKph });
}

async function assertFullInvalidSpeed(speedKph: number): Promise<void> {
  const { service, speedingDetector, inactivityDetector, lifecycleCalls } = productionEvaluation();
  const result = await service.evaluateObservation(observationAt(0, speedKph));
  assert.equal(result.speeding.detection.status, "IGNORED"); assert.equal(result.speeding.detection.reason, "INVALID_OBSERVATION");
  assert.equal(result.inactivity.detection.status, "IGNORED"); assert.equal(result.inactivity.detection.reason, "INVALID_OBSERVATION");
  assert.equal(result.speeding.processing.action, "NONE"); assert.equal(result.inactivity.processing.action, "NONE");
  assert.equal(lifecycleCalls.length, 0); assert.equal(speedingDetector.stateCount(), 0); assert.equal(inactivityDetector.stateCount(), 0);
}

test("1-6. evaluates one immutable observation in shared detection then persistence order", async () => {
  const { service, order, received } = setup();
  const result = await service.evaluateObservation(OBSERVATION);
  assert.deepEqual(order, ["speeding detector", "inactivity detector", "speeding processor", "inactivity processor"]);
  assert.equal(received.speeding.length, 1); assert.equal(received.inactivity.length, 1);
  assert.equal(received.speeding[0], OBSERVATION); assert.equal(received.inactivity[0], OBSERVATION);
  assert.equal(result.vehicleId, VEHICLE_ID); assert.equal(result.observedAt, OBSERVED_AT);
});

test("7-8. speeding PENDING and inactivity COLLECTING both process as NONE", async () => {
  const speed = speeding(); const idle = inactivity();
  const { service, order } = setup({ speedingDetection: speed, inactivityDetection: idle });
  const result = await service.evaluateObservation(OBSERVATION);
  assert.equal(result.speeding.processing.action, "NONE"); assert.equal(result.inactivity.processing.action, "NONE");
  assert.deepEqual(order, ["speeding detector", "inactivity detector", "speeding processor", "inactivity processor"]);
});

test("9-10. both CONFIRMED preserve production OPEN/CREATED outcomes", async () => {
  const speed = speeding({ status: "CONFIRMED", consecutiveCount: 2, newlyConfirmed: true, confirmationPosition: { latitude: 49.2328, longitude: 28.481 }, confirmationObservedAt: OBSERVED_AT, streakStart: { observedAt: OBSERVED_AT, latitude: 49.2328, longitude: 28.481 }, speedingPosition: { latitude: 49.2328, longitude: 28.481 } });
  const idle = inactivity({ status: "CONFIRMED", reason: "INACTIVITY_CONFIRMED", elapsedMinutes: 60, traveledDistanceMeters: 12, windowPointCount: 4, newlyConfirmed: true });
  const { processor, calls } = productionProcessor();
  const speedDetector = { detect: async () => speed, resetVehicle() {}, clearAll() {} } as unknown as SpeedingDetectorService;
  const idleDetector = { detect: async () => idle, resetVehicle() {}, clearAll() {} } as unknown as InactivityDetectorService;
  const result = await new AlertEvaluationService(speedDetector, idleDetector, processor).evaluateObservation(OBSERVATION);
  assert.equal(result.speeding.processing.action, "OPEN"); assert.equal(result.speeding.processing.persistenceOutcome, "CREATED");
  assert.equal(result.inactivity.processing.action, "OPEN"); assert.equal(result.inactivity.processing.persistenceOutcome, "CREATED");
  assert.deepEqual(calls, ["openSpeedingEvent", "openInactivityEvent"]);
});

test("11. both ACTIVE preserve production UPDATE/UPDATED outcomes", async () => {
  const speed = speeding({ status: "ACTIVE", consecutiveCount: 3, confirmationObservedAt: OBSERVED_AT, speedingPosition: { latitude: 49.2328, longitude: 28.481 } });
  const idle = inactivity({ status: "ACTIVE", reason: "INACTIVITY_ACTIVE", elapsedMinutes: 60, traveledDistanceMeters: 10, windowPointCount: 4 });
  const { processor, calls } = productionProcessor({ outcome: "UPDATED", eventId: "updated" });
  const service = new AlertEvaluationService(
    { detect: async () => speed } as unknown as SpeedingDetectorService,
    { detect: async () => idle } as unknown as InactivityDetectorService,
    processor,
  );
  const result = await service.evaluateObservation(OBSERVATION);
  assert.equal(result.speeding.processing.action, "UPDATE"); assert.equal(result.speeding.processing.persistenceOutcome, "UPDATED");
  assert.equal(result.inactivity.processing.action, "UPDATE"); assert.equal(result.inactivity.processing.persistenceOutcome, "UPDATED");
  assert.deepEqual(calls, ["updateSpeedingEvent", "updateInactivityEvent"]);
});

test("12. both CLEAR preserve production RESOLVE/RESOLVED outcomes", async () => {
  const speed = speeding({ status: "CLEAR", reason: "BELOW_OR_EQUAL_THRESHOLD", speedKph: 60, consecutiveCount: 0 });
  const idle = inactivity({ status: "CLEAR", reason: "DISTANCE_THRESHOLD_REACHED", elapsedMinutes: 60, traveledDistanceMeters: 350, windowPointCount: 4 });
  const { processor, calls } = productionProcessor({ outcome: "RESOLVED", eventId: "resolved" });
  const service = new AlertEvaluationService(
    { detect: async () => speed } as unknown as SpeedingDetectorService,
    { detect: async () => idle } as unknown as InactivityDetectorService,
    processor,
  );
  const result = await service.evaluateObservation(OBSERVATION);
  assert.equal(result.speeding.processing.action, "RESOLVE"); assert.equal(result.speeding.processing.persistenceOutcome, "RESOLVED");
  assert.equal(result.inactivity.processing.action, "RESOLVE"); assert.equal(result.inactivity.processing.persistenceOutcome, "RESOLVED");
  assert.deepEqual(calls, ["resolveSpeedingEvent", "resolveInactivityEvent"]);
});

test("13. shared invalid observation is IGNORED by both and performs zero lifecycle mutations", async () => {
  const invalidSpeed = speeding({ observedAt: null, status: "IGNORED", reason: "INVALID_OBSERVATION", zone: "UNKNOWN", speedKph: null, thresholdKph: null, consecutiveCount: 0, confirmationRequired: 0 });
  const invalidIdle = inactivity({ observedAt: null, status: "IGNORED", reason: "INVALID_OBSERVATION", elapsedMinutes: null, distanceThresholdMeters: null, durationThresholdMinutes: null, windowPointCount: 0 });
  const { processor, calls } = productionProcessor();
  const result = await new AlertEvaluationService(
    { detect: async () => invalidSpeed } as unknown as SpeedingDetectorService,
    { detect: async () => { throw new Error("ordinary inactivity detect must be skipped"); }, invalidResult: () => invalidIdle } as unknown as InactivityDetectorService,
    processor,
  ).evaluateObservation(Object.freeze({ ...OBSERVATION, latitude: Number.NaN }));
  assert.equal(result.speeding.detection.reason, "INVALID_OBSERVATION"); assert.equal(result.inactivity.detection.reason, "INVALID_OBSERVATION");
  assert.equal(result.speeding.processing.action, "NONE"); assert.equal(result.inactivity.processing.action, "NONE"); assert.equal(calls.length, 0);
});

test("13a. NaN speed invalidates both pipelines without accepting detector state", async () => {
  await assertFullInvalidSpeed(Number.NaN);
});

test("13b. Infinity speed invalidates both pipelines without accepting detector state", async () => {
  await assertFullInvalidSpeed(Number.POSITIVE_INFINITY);
});

test("13c. negative speed invalidates both pipelines without accepting detector state", async () => {
  await assertFullInvalidSpeed(-1);
});

test("13d. invalid speed cannot advance an almost-confirmed inactivity window", async () => {
  const { service, lifecycleCalls } = productionEvaluation();
  assert.equal((await service.evaluateObservation(observationAt(0, 0))).inactivity.detection.status, "COLLECTING");
  assert.equal((await service.evaluateObservation(observationAt(3_599_000, 0))).inactivity.detection.status, "COLLECTING");
  const callsBeforeInvalid = lifecycleCalls.length;
  const invalid = await service.evaluateObservation(observationAt(3_600_000, Number.NaN));
  assert.equal(invalid.inactivity.detection.reason, "INVALID_OBSERVATION"); assert.equal(invalid.inactivity.processing.action, "NONE");
  assert.equal(lifecycleCalls.length, callsBeforeInvalid);

  const validAtSameTimestamp = await service.evaluateObservation(observationAt(3_600_000, 0));
  assert.equal(validAtSameTimestamp.inactivity.detection.status, "CONFIRMED");
  assert.equal(validAtSameTimestamp.inactivity.detection.reason, "INACTIVITY_CONFIRMED");
  assert.equal(validAtSameTimestamp.inactivity.processing.action, "OPEN");
  assert.notEqual(validAtSameTimestamp.inactivity.detection.reason, "OUT_OF_ORDER");
});

test("13e. invalid speed cannot clear or update an ACTIVE inactivity episode", async () => {
  const { service, lifecycleCalls } = productionEvaluation();
  await service.evaluateObservation(observationAt(0, 0));
  await service.evaluateObservation(observationAt(3_599_000, 0));
  assert.equal((await service.evaluateObservation(observationAt(3_600_000, 0))).inactivity.detection.status, "CONFIRMED");
  assert.equal((await service.evaluateObservation(observationAt(3_660_000, 0))).inactivity.detection.status, "ACTIVE");
  const callsBeforeInvalid = lifecycleCalls.length;
  const movementThatWouldClear = Object.freeze({ latitude: OBSERVATION.latitude as number + 0.01, longitude: OBSERVATION.longitude as number });
  const invalid = await service.evaluateObservation(observationAt(3_720_000, -1, movementThatWouldClear));
  assert.equal(invalid.inactivity.detection.reason, "INVALID_OBSERVATION"); assert.equal(invalid.inactivity.processing.action, "NONE");
  assert.equal(lifecycleCalls.length, callsBeforeInvalid);

  const validAtSameTimestamp = await service.evaluateObservation(observationAt(3_720_000, 0));
  assert.equal(validAtSameTimestamp.inactivity.detection.status, "ACTIVE");
  assert.equal(validAtSameTimestamp.inactivity.processing.action, "UPDATE");
  assert.equal(validAtSameTimestamp.inactivity.processing.persistenceOutcome, "UPDATED");
});

test("13f. invalid vehicle, time, latitude, and longitude still invalidate both pipelines", async () => {
  const invalidObservations: AlertEvaluationObservation[] = [
    Object.freeze({ ...OBSERVATION, vehicleId: "" }),
    Object.freeze({ ...OBSERVATION, observedAt: "not-a-date" }),
    Object.freeze({ ...OBSERVATION, latitude: Number.NaN }),
    Object.freeze({ ...OBSERVATION, longitude: Number.POSITIVE_INFINITY }),
  ];
  for (const input of invalidObservations) {
    const { service, inactivityDetector, lifecycleCalls } = productionEvaluation();
    const result = await service.evaluateObservation(input);
    assert.equal(result.speeding.detection.reason, "INVALID_OBSERVATION"); assert.equal(result.inactivity.detection.reason, "INVALID_OBSERVATION");
    assert.equal(result.speeding.processing.action, "NONE"); assert.equal(result.inactivity.processing.action, "NONE");
    assert.equal(inactivityDetector.stateCount(), 0); assert.equal(lifecycleCalls.length, 0);
  }
});

test("14. duplicate/out-of-order observation is IGNORED by both with zero lifecycle mutations", async () => {
  const ignoredSpeed = speeding({ status: "IGNORED", reason: "OUT_OF_ORDER" });
  const ignoredIdle = inactivity({ status: "IGNORED", reason: "OUT_OF_ORDER" });
  const { processor, calls } = productionProcessor();
  const result = await new AlertEvaluationService(
    { detect: async () => ignoredSpeed } as unknown as SpeedingDetectorService,
    { detect: async () => ignoredIdle } as unknown as InactivityDetectorService,
    processor,
  ).evaluateObservation(OBSERVATION);
  assert.equal(result.speeding.processing.action, "NONE"); assert.equal(result.inactivity.processing.action, "NONE"); assert.equal(calls.length, 0);
});

test("15. UNKNOWN speed zone never short-circuits inactivity", async () => {
  const { service, order } = setup({ speedingDetection: speeding({ status: "IGNORED", reason: "UNKNOWN_ZONE", zone: "UNKNOWN", thresholdKph: null }) });
  assert.equal((await service.evaluateObservation(OBSERVATION)).speeding.processing.action, "NONE");
  assert.deepEqual(order, ["speeding detector", "inactivity detector", "speeding processor", "inactivity processor"]);
});

test("16. disabled speed rule never short-circuits inactivity", async () => {
  const { service, order } = setup({ speedingDetection: speeding({ status: "IGNORED", reason: "RULE_DISABLED" }) });
  await service.evaluateObservation(OBSERVATION);
  assert.deepEqual(order, ["speeding detector", "inactivity detector", "speeding processor", "inactivity processor"]);
});

test("17. disabled inactivity rule does not affect the preceding speeding pipeline", async () => {
  const { service, order } = setup({ inactivityDetection: inactivity({ status: "IGNORED", reason: "RULE_DISABLED" }) });
  await service.evaluateObservation(OBSERVATION);
  assert.deepEqual(order, ["speeding detector", "inactivity detector", "speeding processor", "inactivity processor"]);
});

test("18. speeding detector exception propagates and stops all later operations", async () => {
  const failure = new Error("speed detector failed"); const { service, order } = setup({ speedingDetectorError: failure });
  await assert.rejects(service.evaluateObservation(OBSERVATION), (error) => error === failure);
  assert.deepEqual(order, ["speeding detector"]);
});

test("19. speeding processor exception propagates after the shared detection path", async () => {
  const failure = new Error("speed persistence failed"); const { service, order } = setup({ speedingProcessorError: failure });
  await assert.rejects(service.evaluateObservation(OBSERVATION), (error) => error === failure);
  assert.deepEqual(order, ["speeding detector", "inactivity detector", "speeding processor"]);
});

test("20. inactivity detector exception propagates before either processor", async () => {
  const failure = new Error("inactivity detector failed"); const { service, order } = setup({ inactivityDetectorError: failure });
  await assert.rejects(service.evaluateObservation(OBSERVATION), (error) => error === failure);
  assert.deepEqual(order, ["speeding detector", "inactivity detector"]);
});

test("21. inactivity processor exception propagates unchanged", async () => {
  const failure = new Error("inactivity persistence failed"); const { service, order } = setup({ inactivityProcessorError: failure });
  await assert.rejects(service.evaluateObservation(OBSERVATION), (error) => error === failure);
  assert.deepEqual(order, ["speeding detector", "inactivity detector", "speeding processor", "inactivity processor"]);
});

test("22. aggregate result contains no coordinates, Polygon, settings snapshot, history, or rows", async () => {
  const result = await setup().service.evaluateObservation(OBSERVATION);
  const serialized = JSON.stringify(result);
  for (const forbidden of ["latitude", "longitude", "coordinates", "Polygon", "settingsSnapshot", "history", "row"]) assert.equal(serialized.includes(forbidden), false);
  assert.deepEqual(Object.keys(result).sort(), ["inactivity", "observedAt", "speeding", "vehicleId"]);
});

test("23. orchestration does not mutate or round the input observation", async () => {
  const input = Object.freeze({ ...OBSERVATION, latitude: 49.232812345678, longitude: 28.481098765432, speedKph: 72.123456789 });
  const before = { ...input }; const { service, received } = setup();
  await service.evaluateObservation(input);
  assert.deepEqual(input, before); assert.equal(received.speeding[0], input); assert.equal(received.inactivity[0], input);
  assert.equal(received.speeding[0]?.speedKph, 72.123456789);
});

test("24. resetVehicle resets both detector singletons only", () => {
  const { service, resets } = setup(); service.resetVehicle(VEHICLE_ID);
  assert.deepEqual(resets.speeding, [VEHICLE_ID]); assert.deepEqual(resets.inactivity, [VEHICLE_ID]);
});

test("25. clearAll clears both detector singletons", () => {
  const { service, resets } = setup(); service.clearAll();
  assert.equal(resets.speedingClear, 1); assert.equal(resets.inactivityClear, 1);
});

test("26. persistence failure leaves advanced detector state and replay may be OUT_OF_ORDER", async () => {
  const stateMachine = new SpeedingDetectorStateMachine();
  const context = Object.freeze({ ruleEnabled: true, zone: "CITY" as const, thresholdKph: 60, confirmationRequired: 1, settingsFingerprint: "settings-a" });
  const speedDetector = {
    detect: async (input: AlertEvaluationObservation) => stateMachine.detect(input, context),
    resetVehicle: (vehicleId: string) => stateMachine.resetVehicle(vehicleId), clearAll: () => stateMachine.clearAll(),
  } as unknown as SpeedingDetectorService;
  let speedProcessingCalls = 0; let inactivityCalls = 0;
  const processor = {
    processSpeedingResult: async (result: SpeedingDetectionResult) => {
      speedProcessingCalls += 1;
      if (speedProcessingCalls === 1) throw new Error("database failed after detector transition");
      return speedingProcessing(result);
    },
    processInactivityResult: async (result: InactivityDetectionResult) => inactivityProcessing(result),
  } as unknown as AlertEventProcessorService;
  const idleDetector = {
    detect: async () => { inactivityCalls += 1; return inactivity(); }, resetVehicle() {}, clearAll() {},
  } as unknown as InactivityDetectorService;
  const service = new AlertEvaluationService(speedDetector, idleDetector, processor);
  await assert.rejects(service.evaluateObservation(OBSERVATION), /database failed/);
  const replay = await service.evaluateObservation(OBSERVATION);
  assert.equal(replay.speeding.detection.status, "IGNORED"); assert.equal(replay.speeding.detection.reason, "OUT_OF_ORDER");
  assert.equal(inactivityCalls, 2);
});
