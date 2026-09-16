import assert from "node:assert/strict";
import test from "node:test";
import type { InactivityDetectionResult } from "../inactivity-detector";
import type { SpeedingDetectionResult } from "../speeding-detector";
import { AlertEventProcessorService } from "./alert-event-processor.service";
import type { AlertEventLifecycleResult } from "./alert-events.types";
import { AlertEventValidationError } from "./alert-events.validation";
import type { AlertEventsLifecycleService } from "./alert-events-lifecycle.service";

const VEHICLE_ID = "00000000-0000-4000-8000-000000000001";
const OBSERVED_AT = "2026-08-08T10:00:00.000Z";

function speeding(overrides: Partial<SpeedingDetectionResult> = {}): SpeedingDetectionResult {
  return { vehicleId: VEHICLE_ID, observedAt: OBSERVED_AT, status: "CONFIRMED", reason: "ABOVE_THRESHOLD", zone: "CITY", speedKph: 72, thresholdKph: 60, consecutiveCount: 2, confirmationRequired: 2, newlyConfirmed: true, confirmationPosition: { latitude: 49.23, longitude: 28.48 }, confirmationObservedAt: OBSERVED_AT, streakStart: { observedAt: "2026-08-08T09:59:59.000Z", latitude: 49.22, longitude: 28.47 }, speedingPosition: { latitude: 49.23, longitude: 28.48 }, ...overrides };
}

function inactivity(overrides: Partial<InactivityDetectionResult> = {}): InactivityDetectionResult {
  return { vehicleId: VEHICLE_ID, observedAt: OBSERVED_AT, status: "CONFIRMED", reason: "INACTIVITY_CONFIRMED", elapsedMinutes: 60, traveledDistanceMeters: 12, distanceThresholdMeters: 300, durationThresholdMinutes: 60, windowPointCount: 3, newlyConfirmed: true, ...overrides };
}

type LifecycleMethod = "openSpeedingEvent" | "updateSpeedingEvent" | "resolveSpeedingEvent" | "openInactivityEvent" | "updateInactivityEvent" | "resolveInactivityEvent";
type LifecycleCall = Readonly<{ method: LifecycleMethod; command: unknown }>;

function setup(overrides: Partial<Record<LifecycleMethod, AlertEventLifecycleResult | Error>> = {}) {
  const calls: LifecycleCall[] = [];
  const invoke = async (method: LifecycleMethod, command: unknown): Promise<AlertEventLifecycleResult> => {
    calls.push({ method, command });
    const configured = overrides[method] ?? { outcome: "CREATED", eventId: "event-1" };
    if (configured instanceof Error) throw configured;
    return configured;
  };
  const lifecycle = {
    openSpeedingEvent: (command: unknown) => invoke("openSpeedingEvent", command),
    updateSpeedingEvent: (command: unknown) => invoke("updateSpeedingEvent", command),
    resolveSpeedingEvent: (command: unknown) => invoke("resolveSpeedingEvent", command),
    openInactivityEvent: (command: unknown) => invoke("openInactivityEvent", command),
    updateInactivityEvent: (command: unknown) => invoke("updateInactivityEvent", command),
    resolveInactivityEvent: (command: unknown) => invoke("resolveInactivityEvent", command),
  } as unknown as AlertEventsLifecycleService;
  return { processor: new AlertEventProcessorService(lifecycle), calls };
}

test("1. speeding PENDING returns NONE without lifecycle calls", async () => {
  const { processor, calls } = setup();
  const result = await processor.processSpeedingResult(speeding({ status: "PENDING", newlyConfirmed: false }));
  assert.deepEqual(result, { eventType: "SPEEDING", detectorStatus: "PENDING", action: "NONE", persistenceOutcome: null, eventId: null, databaseWriteAttempted: false, lifecycleResult: null });
  assert.equal(calls.length, 0);
});

test("2. speeding IGNORED returns NONE", async () => {
  const { processor, calls } = setup();
  assert.equal((await processor.processSpeedingResult(speeding({ status: "IGNORED", newlyConfirmed: false }))).action, "NONE");
  assert.equal(calls.length, 0);
});

test("3. speeding CONFIRMED with newlyConfirmed=false returns NONE", async () => {
  const { processor, calls } = setup();
  assert.equal((await processor.processSpeedingResult(speeding({ newlyConfirmed: false }))).action, "NONE");
  assert.equal(calls.length, 0);
});

test("4. speeding newly confirmed routes the mapper OPEN command to lifecycle", async () => {
  const { processor, calls } = setup();
  assert.equal((await processor.processSpeedingResult(speeding())).action, "OPEN");
  assert.deepEqual(calls, [{ method: "openSpeedingEvent", command: { type: "SPEEDING", vehicleId: VEHICLE_ID, observedAt: new Date(OBSERVED_AT), zone: "CITY", speedKph: 72, speedThresholdKph: 60, confirmationLatitude: 49.23, confirmationLongitude: 28.48, speedingStreakStartedAt: new Date("2026-08-08T09:59:59.000Z"), speedingStreakStartLatitude: 49.22, speedingStreakStartLongitude: 28.47 } }]);
});

test("5. speeding CREATED is returned transparently", async () => {
  const lifecycleResult = { outcome: "CREATED", eventId: "created-id" } as const;
  const result = await setup({ openSpeedingEvent: lifecycleResult }).processor.processSpeedingResult(speeding());
  assert.equal(result.persistenceOutcome, "CREATED"); assert.equal(result.eventId, "created-id"); assert.equal(result.lifecycleResult, lifecycleResult); assert.equal(result.databaseWriteAttempted, true);
});

test("6. speeding ALREADY_EXISTS is a successful processing result", async () => {
  const result = await setup({ openSpeedingEvent: { outcome: "ALREADY_EXISTS", eventId: "existing-id" } }).processor.processSpeedingResult(speeding());
  assert.equal(result.persistenceOutcome, "ALREADY_EXISTS"); assert.equal(result.eventId, "existing-id");
});

test("7. speeding ALREADY_OPEN is a successful processing result", async () => {
  const result = await setup({ openSpeedingEvent: { outcome: "ALREADY_OPEN", eventId: "open-id", updated: true } }).processor.processSpeedingResult(speeding());
  assert.equal(result.persistenceOutcome, "ALREADY_OPEN"); assert.deepEqual(result.lifecycleResult, { outcome: "ALREADY_OPEN", eventId: "open-id", updated: true });
});

test("8. speeding ACTIVE routes UPDATE", async () => {
  const { processor, calls } = setup({ updateSpeedingEvent: { outcome: "UPDATED", eventId: "event-1" } });
  assert.equal((await processor.processSpeedingResult(speeding({ status: "ACTIVE", newlyConfirmed: false }))).action, "UPDATE");
  assert.equal(calls[0]?.method, "updateSpeedingEvent");
});

test("9. speeding UPDATE returns UPDATED", async () => {
  const result = await setup({ updateSpeedingEvent: { outcome: "UPDATED", eventId: "updated-id" } }).processor.processSpeedingResult(speeding({ status: "ACTIVE", newlyConfirmed: false }));
  assert.equal(result.persistenceOutcome, "UPDATED"); assert.equal(result.eventId, "updated-id");
});

test("10. speeding ACTIVE without OPEN returns lifecycle NOOP", async () => {
  const result = await setup({ updateSpeedingEvent: { outcome: "NOOP", reason: "MISSING_OPEN_EVENT" } }).processor.processSpeedingResult(speeding({ status: "ACTIVE", newlyConfirmed: false }));
  assert.equal(result.persistenceOutcome, "NOOP"); assert.equal(result.eventId, null); assert.deepEqual(result.lifecycleResult, { outcome: "NOOP", reason: "MISSING_OPEN_EVENT" });
});

test("11. speeding CLEAR routes RESOLVE", async () => {
  const { processor, calls } = setup({ resolveSpeedingEvent: { outcome: "RESOLVED", eventId: "event-1" } });
  assert.equal((await processor.processSpeedingResult(speeding({ status: "CLEAR", newlyConfirmed: false }))).action, "RESOLVE");
  assert.equal(calls[0]?.method, "resolveSpeedingEvent");
});

test("12. speeding resolve returns RESOLVED", async () => {
  const result = await setup({ resolveSpeedingEvent: { outcome: "RESOLVED", eventId: "resolved-id" } }).processor.processSpeedingResult(speeding({ status: "CLEAR", newlyConfirmed: false }));
  assert.equal(result.persistenceOutcome, "RESOLVED"); assert.equal(result.eventId, "resolved-id");
});

test("13. speeding CLEAR without OPEN returns lifecycle NOOP", async () => {
  const result = await setup({ resolveSpeedingEvent: { outcome: "NOOP", reason: "MISSING_OPEN_EVENT" } }).processor.processSpeedingResult(speeding({ status: "CLEAR", newlyConfirmed: false }));
  assert.equal(result.persistenceOutcome, "NOOP"); assert.equal(result.eventId, null);
});

test("14. inactivity COLLECTING returns NONE", async () => {
  const { processor, calls } = setup();
  assert.equal((await processor.processInactivityResult(inactivity({ status: "COLLECTING", newlyConfirmed: false }))).action, "NONE"); assert.equal(calls.length, 0);
});

test("15. inactivity IGNORED returns NONE", async () => {
  const { processor, calls } = setup();
  assert.equal((await processor.processInactivityResult(inactivity({ status: "IGNORED", newlyConfirmed: false }))).action, "NONE"); assert.equal(calls.length, 0);
});

test("16. inactivity CONFIRMED with newlyConfirmed=false returns NONE", async () => {
  const { processor, calls } = setup();
  assert.equal((await processor.processInactivityResult(inactivity({ newlyConfirmed: false }))).action, "NONE"); assert.equal(calls.length, 0);
});

test("17. inactivity newly confirmed routes OPEN", async () => {
  const { processor, calls } = setup({ openInactivityEvent: { outcome: "CREATED", eventId: "event-1" } });
  const result = await processor.processInactivityResult(inactivity());
  assert.equal(result.action, "OPEN"); assert.equal(result.persistenceOutcome, "CREATED"); assert.equal(calls[0]?.method, "openInactivityEvent");
});

test("18. inactivity ACTIVE routes UPDATE", async () => {
  const { processor, calls } = setup({ updateInactivityEvent: { outcome: "UPDATED", eventId: "event-1" } });
  const result = await processor.processInactivityResult(inactivity({ status: "ACTIVE", newlyConfirmed: false }));
  assert.equal(result.action, "UPDATE"); assert.equal(result.persistenceOutcome, "UPDATED"); assert.equal(calls[0]?.method, "updateInactivityEvent");
});

test("19. inactivity CLEAR routes RESOLVE", async () => {
  const { processor, calls } = setup({ resolveInactivityEvent: { outcome: "RESOLVED", eventId: "event-1" } });
  const result = await processor.processInactivityResult(inactivity({ status: "CLEAR", newlyConfirmed: false }));
  assert.equal(result.action, "RESOLVE"); assert.equal(result.persistenceOutcome, "RESOLVED"); assert.equal(calls[0]?.method, "resolveInactivityEvent");
});

test("20. lifecycle exceptions propagate unchanged", async () => {
  const failure = new Error("database unavailable");
  await assert.rejects(setup({ openSpeedingEvent: failure }).processor.processSpeedingResult(speeding()), (error) => error === failure);
});

test("21. mapper validation exceptions propagate before lifecycle", async () => {
  const { processor, calls } = setup();
  await assert.rejects(processor.processSpeedingResult(speeding({ vehicleId: "external-device-42" })), AlertEventValidationError);
  assert.equal(calls.length, 0);
});

test("22. every NONE case performs zero lifecycle operations", async () => {
  const { processor, calls } = setup();
  await processor.processSpeedingResult(speeding({ status: "PENDING", newlyConfirmed: false }));
  await processor.processSpeedingResult(speeding({ status: "IGNORED", newlyConfirmed: false }));
  await processor.processSpeedingResult(speeding({ newlyConfirmed: false }));
  await processor.processInactivityResult(inactivity({ status: "COLLECTING", newlyConfirmed: false }));
  await processor.processInactivityResult(inactivity({ status: "IGNORED", newlyConfirmed: false }));
  await processor.processInactivityResult(inactivity({ newlyConfirmed: false }));
  assert.equal(calls.length, 0);
});

test("23. processing result exposes no coordinates, Polygon, history, rows, or snapshots", async () => {
  const result = await setup().processor.processSpeedingResult(speeding());
  assert.deepEqual(Object.keys(result).sort(), ["action", "databaseWriteAttempted", "detectorStatus", "eventId", "eventType", "lifecycleResult", "persistenceOutcome"]);
  for (const forbidden of ["latitude", "longitude", "coordinates", "Polygon", "history", "row", "settingsSnapshot"]) assert.equal(forbidden in result, false);
});

test("24. speed and inactivity commands preserve only their safe metrics", async () => {
  const { processor, calls } = setup({ updateSpeedingEvent: { outcome: "UPDATED", eventId: "speed" }, updateInactivityEvent: { outcome: "UPDATED", eventId: "idle" } });
  await processor.processSpeedingResult(speeding({ status: "ACTIVE", newlyConfirmed: false, speedKph: 88 }));
  await processor.processInactivityResult(inactivity({ status: "ACTIVE", newlyConfirmed: false, traveledDistanceMeters: 7 }));
  assert.deepEqual(calls[0]?.command, { type: "SPEEDING", vehicleId: VEHICLE_ID, observedAt: new Date(OBSERVED_AT), speedKph: 88, latitude: 49.23, longitude: 28.48, confirmationObservedAt: new Date(OBSERVED_AT) });
  assert.deepEqual(calls[1]?.command, { type: "INACTIVITY", vehicleId: VEHICLE_ID, observedAt: new Date(OBSERVED_AT), traveledDistanceMeters: 7 });
});

test("25. speeding and inactivity event types cannot be mixed by the processor", async () => {
  const { processor, calls } = setup({ openSpeedingEvent: { outcome: "CREATED", eventId: "speed" }, openInactivityEvent: { outcome: "CREATED", eventId: "idle" } });
  const speed = await processor.processSpeedingResult(speeding());
  const idle = await processor.processInactivityResult(inactivity());
  assert.equal(speed.eventType, "SPEEDING"); assert.equal(idle.eventType, "INACTIVITY");
  assert.deepEqual(calls.map(({ method }) => method), ["openSpeedingEvent", "openInactivityEvent"]);
});
