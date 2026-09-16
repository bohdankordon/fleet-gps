import assert from "node:assert/strict";
import test from "node:test";
import { AlertEventsLifecycleService } from "./alert-events-lifecycle.service";
import type { AlertEventsRepository, ConditionalAlertEventMutation, RegisterAlertEventConfirmationInput, RegisterAlertEventConfirmationResult } from "./alert-events.repository";
import type { AlertEventRecord, AlertEventType, InactivityAlertEventRecord, OpenInactivityEventCommand, OpenSpeedingEventCommand, ResolveAlertEventCommand, SpeedingAlertEventRecord, UpdateAlertEventCommand } from "./alert-events.types";

const VEHICLE_A = "00000000-0000-4000-8000-000000000001";
const VEHICLE_B = "00000000-0000-4000-8000-000000000002";
const at = (minute: number): Date => new Date(Date.UTC(2026, 7, 8, 10, minute));

class MemoryAlertEventsRepository implements AlertEventsRepository {
  public events: AlertEventRecord[] = [];
  public receipts = new Map<string, string>();
  public notifications = new Map<string, "ALERT_CONFIRMED">();
  private sequence = 0;

  public async findOpenByVehicleAndType(vehicleId: string, type: AlertEventType): Promise<AlertEventRecord | null> {
    return this.events.find((event) => event.vehicleId === vehicleId && event.type === type && event.status === "OPEN") ?? null;
  }

  public async registerConfirmation(input: RegisterAlertEventConfirmationInput): Promise<RegisterAlertEventConfirmationResult> {
    const exactEventId = this.receipts.get(input.dedupeKey);
    if (exactEventId !== undefined) return { outcome: "ALREADY_EXISTS", eventId: exactEventId };
    const existing = this.events.find((event) => event.vehicleId === input.command.vehicleId && event.type === input.command.type && event.status === "OPEN") ?? null;
    if (existing !== null) {
      this.receipts.set(input.dedupeKey, existing.id);
      const command: UpdateAlertEventCommand = input.command.type === "SPEEDING"
        ? { type: "SPEEDING", vehicleId: input.command.vehicleId, observedAt: input.command.observedAt, speedKph: input.command.speedKph, latitude: input.command.confirmationLatitude, longitude: input.command.confirmationLongitude, confirmationObservedAt: input.command.observedAt }
        : { type: "INACTIVITY", vehicleId: input.command.vehicleId, observedAt: input.command.observedAt, traveledDistanceMeters: input.command.traveledDistanceMeters };
      const updated = input.command.observedAt.getTime() > existing.lastObservedAt.getTime() && await this.updateOpen({ event: existing, command });
      return { outcome: "ALREADY_OPEN", event: existing, updated };
    }
    const base = { id: `event-${++this.sequence}`, vehicleId: input.command.vehicleId, status: "OPEN" as const, confirmedAt: input.command.observedAt, lastObservedAt: input.command.observedAt, resolvedAt: null, dedupeKey: input.dedupeKey, activeKey: input.activeKey };
    const event: AlertEventRecord = input.command.type === "SPEEDING"
      ? { ...base, type: "SPEEDING", speedZone: input.command.zone, confirmationSpeedKph: input.command.speedKph, confirmationLatitude: input.command.confirmationLatitude, confirmationLongitude: input.command.confirmationLongitude, lastSpeedKph: input.command.speedKph, peakSpeedKph: input.command.speedKph, speedThresholdKph: input.command.speedThresholdKph }
      : { ...base, type: "INACTIVITY", confirmationTraveledDistanceMeters: input.command.traveledDistanceMeters, lastTraveledDistanceMeters: input.command.traveledDistanceMeters, minimumTraveledDistanceMeters: input.command.traveledDistanceMeters, distanceThresholdMeters: input.command.distanceThresholdMeters, durationThresholdMinutes: input.command.durationThresholdMinutes };
    this.events.push(event);
    this.receipts.set(input.dedupeKey, event.id);
    this.notifications.set(event.id, "ALERT_CONFIRMED");
    return { outcome: "CREATED", event };
  }

  public async updateOpen(input: ConditionalAlertEventMutation<UpdateAlertEventCommand>): Promise<boolean> {
    const index = this.matchingIndex(input.event);
    if (index < 0) return false;
    const current = this.events[index]!;
    this.events[index] = input.command.type === "SPEEDING"
      ? { ...(current as SpeedingAlertEventRecord), lastObservedAt: input.command.observedAt, lastSpeedKph: input.command.speedKph, peakSpeedKph: Math.max((current as SpeedingAlertEventRecord).peakSpeedKph, input.command.speedKph) }
      : { ...(current as InactivityAlertEventRecord), lastObservedAt: input.command.observedAt, lastTraveledDistanceMeters: input.command.traveledDistanceMeters, minimumTraveledDistanceMeters: Math.min((current as InactivityAlertEventRecord).minimumTraveledDistanceMeters, input.command.traveledDistanceMeters) };
    return true;
  }

  public async resolveOpen(input: ConditionalAlertEventMutation<ResolveAlertEventCommand>): Promise<boolean> {
    const index = this.matchingIndex(input.event);
    if (index < 0) return false;
    const current = this.events[index]!;
    const lifecycle = { status: "RESOLVED" as const, resolvedAt: input.command.observedAt, lastObservedAt: input.command.observedAt, activeKey: null };
    this.events[index] = input.command.type === "SPEEDING"
      ? { ...(current as SpeedingAlertEventRecord), ...lifecycle, lastSpeedKph: input.command.speedKph, peakSpeedKph: Math.max((current as SpeedingAlertEventRecord).peakSpeedKph, input.command.speedKph) }
      : { ...(current as InactivityAlertEventRecord), ...lifecycle, lastTraveledDistanceMeters: input.command.traveledDistanceMeters, minimumTraveledDistanceMeters: Math.min((current as InactivityAlertEventRecord).minimumTraveledDistanceMeters, input.command.traveledDistanceMeters) };
    return true;
  }

  public async verifySpeedingUpdateApplied(event: AlertEventRecord, command: Extract<UpdateAlertEventCommand, { type: "SPEEDING" }>): Promise<boolean> {
    return event.type === "SPEEDING" && event.lastObservedAt.getTime() === command.observedAt.getTime() && event.lastSpeedKph === command.speedKph;
  }

  private matchingIndex(expected: AlertEventRecord): number {
    return this.events.findIndex((event) => event.id === expected.id && event.status === "OPEN" && event.lastObservedAt.getTime() === expected.lastObservedAt.getTime());
  }
}

function setup() {
  const repository = new MemoryAlertEventsRepository();
  return { repository, service: new AlertEventsLifecycleService(repository) };
}

function speeding(observedAt: Date, speedKph = 70, vehicleId = VEHICLE_A): OpenSpeedingEventCommand {
  return { type: "SPEEDING", vehicleId, observedAt, zone: "CITY", speedKph, speedThresholdKph: 60, confirmationLatitude: 49.23, confirmationLongitude: 28.48, speedingStreakStartedAt: observedAt, speedingStreakStartLatitude: 49.23, speedingStreakStartLongitude: 28.48 };
}

function active(observedAt: Date, speedKph = 70, confirmationObservedAt = at(0)): Extract<UpdateAlertEventCommand, { type: "SPEEDING" }> {
  return { type: "SPEEDING", vehicleId: VEHICLE_A, observedAt, speedKph, latitude: 49.23, longitude: 28.48, confirmationObservedAt };
}

function inactivity(observedAt: Date, traveledDistanceMeters = 20, vehicleId = VEHICLE_A): OpenInactivityEventCommand {
  return { type: "INACTIVITY", vehicleId, observedAt, traveledDistanceMeters, distanceThresholdMeters: 300, durationThresholdMinutes: 60 };
}

test("exact duplicate confirmation creates one event and returns ALREADY_EXISTS", async () => {
  const { service, repository } = setup();
  assert.equal((await service.openSpeedingEvent(speeding(at(0)))).outcome, "CREATED");
  assert.equal((await service.openSpeedingEvent(speeding(at(0)))).outcome, "ALREADY_EXISTS");
  assert.equal(repository.events.length, 1);
  assert.equal(repository.receipts.size, 1);
  assert.equal(repository.notifications.size, 1);
});

test("concurrent exact confirmation creates one durable receipt and one OPEN event", async () => {
  const { service, repository } = setup();
  const results = await Promise.all([service.openSpeedingEvent(speeding(at(0))), service.openSpeedingEvent(speeding(at(0)))]);
  assert.deepEqual(new Set(results.map((result) => result.outcome)), new Set(["CREATED", "ALREADY_EXISTS"]));
  assert.equal(repository.events.length, 1); assert.equal(repository.receipts.size, 1); assert.equal(repository.notifications.size, 1);
});

test("exact replay after RESOLVED neither reopens nor creates", async () => {
  const { service, repository } = setup();
  const command = speeding(at(0));
  await service.openSpeedingEvent(command);
  await service.resolveSpeedingEvent({ type: "SPEEDING", vehicleId: VEHICLE_A, observedAt: at(1), speedKph: 40 });
  assert.equal((await service.openSpeedingEvent(command)).outcome, "ALREADY_EXISTS");
  assert.equal(repository.events.length, 1);
  assert.equal(repository.events[0]!.status, "RESOLVED");
  assert.equal(repository.notifications.size, 1);
});

test("coalesced SPEEDING confirmation replay after RESOLVED remains ALREADY_EXISTS", async () => {
  const { service, repository } = setup();
  assert.equal((await service.openSpeedingEvent(speeding(at(0), 70))).outcome, "CREATED");
  const coalesced = speeding(at(5), 90);
  assert.deepEqual(await service.openSpeedingEvent(coalesced), { outcome: "ALREADY_OPEN", eventId: "event-1", updated: true });
  assert.equal((await service.resolveSpeedingEvent({ type: "SPEEDING", vehicleId: VEHICLE_A, observedAt: at(10), speedKph: 40 })).outcome, "RESOLVED");
  assert.deepEqual(await service.openSpeedingEvent(coalesced), { outcome: "ALREADY_EXISTS", eventId: "event-1" });
  assert.equal(repository.events.length, 1); assert.equal(repository.events[0]!.status, "RESOLVED"); assert.equal(repository.events.filter((event) => event.status === "OPEN").length, 0); assert.equal(repository.receipts.size, 2); assert.equal(repository.notifications.size, 1);
});

test("coalesced INACTIVITY confirmation replay after RESOLVED remains ALREADY_EXISTS", async () => {
  const { service, repository } = setup();
  await service.openInactivityEvent(inactivity(at(0), 20));
  const coalesced = inactivity(at(5), 5);
  assert.equal((await service.openInactivityEvent(coalesced)).outcome, "ALREADY_OPEN");
  await service.resolveInactivityEvent({ type: "INACTIVITY", vehicleId: VEHICLE_A, observedAt: at(10), traveledDistanceMeters: 400 });
  assert.equal((await service.openInactivityEvent(coalesced)).outcome, "ALREADY_EXISTS");
  assert.equal(repository.events.length, 1); assert.equal(repository.receipts.size, 2); assert.equal(repository.notifications.size, 1);
});

test("stale distinct confirmation is receipted and cannot reopen after resolve", async () => {
  const { service, repository } = setup();
  await service.openSpeedingEvent(speeding(at(10), 80));
  const stale = speeding(at(5), 90);
  assert.deepEqual(await service.openSpeedingEvent(stale), { outcome: "ALREADY_OPEN", eventId: "event-1", updated: false });
  assert.equal((repository.events[0] as SpeedingAlertEventRecord).lastSpeedKph, 80);
  await service.resolveSpeedingEvent({ type: "SPEEDING", vehicleId: VEHICLE_A, observedAt: at(20), speedKph: 40 });
  assert.equal((await service.openSpeedingEvent(stale)).outcome, "ALREADY_EXISTS");
  assert.equal(repository.events.length, 1); assert.equal(repository.events[0]!.status, "RESOLVED"); assert.equal(repository.receipts.size, 2);
});

test("existing OPEN plus a new confirmation returns ALREADY_OPEN and applies only newer metrics", async () => {
  const { service, repository } = setup();
  await service.openSpeedingEvent(speeding(at(0), 70));
  assert.deepEqual(await service.openSpeedingEvent(speeding(at(3), 90)), { outcome: "ALREADY_OPEN", eventId: "event-1", updated: true });
  assert.deepEqual(await service.openSpeedingEvent(speeding(at(2), 100)), { outcome: "ALREADY_OPEN", eventId: "event-1", updated: false });
  const event = repository.events[0] as SpeedingAlertEventRecord;
  assert.equal(repository.events.length, 1); assert.equal(event.lastObservedAt.getTime(), at(3).getTime()); assert.equal(event.lastSpeedKph, 90); assert.equal(event.peakSpeedKph, 90);
});

test("concurrent confirmations preserve one OPEN per vehicle and type", async () => {
  const { service, repository } = setup();
  const results = await Promise.all([service.openSpeedingEvent(speeding(at(0), 70)), service.openSpeedingEvent(speeding(at(1), 80))]);
  assert.deepEqual(new Set(results.map((result) => result.outcome)), new Set(["CREATED", "ALREADY_OPEN"]));
  assert.equal(repository.events.filter((event) => event.status === "OPEN" && event.type === "SPEEDING").length, 1);
  assert.equal(repository.receipts.size, 2);
  assert.equal(repository.notifications.size, 1);
  assert.equal((repository.events[0] as SpeedingAlertEventRecord).lastSpeedKph, 80);
});

test("one vehicle may hold OPEN SPEEDING and OPEN INACTIVITY simultaneously", async () => {
  const { service, repository } = setup();
  await service.openSpeedingEvent(speeding(at(0)));
  await service.openInactivityEvent(inactivity(at(0)));
  assert.equal(repository.events.filter((event) => event.status === "OPEN").length, 2);
  assert.deepEqual(new Set(repository.events.map((event) => event.type)), new Set(["SPEEDING", "INACTIVITY"]));
  assert.equal(repository.notifications.size, 2);
  assert.deepEqual(new Set(repository.notifications.values()), new Set(["ALERT_CONFIRMED"]));
});

test("CREATED-only notification semantics exclude ALREADY_OPEN, UPDATED, RESOLVED, and NOOP", async () => {
  const { service, repository } = setup();
  assert.equal((await service.openSpeedingEvent(speeding(at(0), 70))).outcome, "CREATED");
  assert.equal(repository.notifications.size, 1);
  assert.equal((await service.openSpeedingEvent(speeding(at(1), 80))).outcome, "ALREADY_OPEN");
  assert.equal((await service.updateSpeedingEvent(active(at(2), 75, at(1)))).outcome, "UPDATED");
  assert.equal((await service.resolveSpeedingEvent({ type: "SPEEDING", vehicleId: VEHICLE_A, observedAt: at(3), speedKph: 40 })).outcome, "RESOLVED");
  assert.equal((await service.updateSpeedingEvent(active(at(4), 75, at(1)))).outcome, "NOOP");
  assert.equal(repository.notifications.size, 1);
});

test("a new episode after RESOLVED creates a second event and second notification", async () => {
  const { service, repository } = setup();
  const first = await service.openSpeedingEvent(speeding(at(0), 70));
  assert.equal(first.outcome, "CREATED");
  await service.resolveSpeedingEvent({ type: "SPEEDING", vehicleId: VEHICLE_A, observedAt: at(5), speedKph: 40 });
  const second = await service.openSpeedingEvent(speeding(at(10), 80));
  assert.equal(second.outcome, "CREATED");
  assert.equal(repository.events.length, 2);
  assert.equal(repository.notifications.size, 2);
  assert.notEqual("eventId" in first ? first.eventId : null, "eventId" in second ? second.eventId : null);
});

test("vehicles have independent OPEN events", async () => {
  const { service, repository } = setup();
  await service.openSpeedingEvent(speeding(at(0), 70, VEHICLE_A));
  await service.openSpeedingEvent(speeding(at(0), 70, VEHICLE_B));
  assert.equal(repository.events.length, 2);
});

test("speeding ACTIVE keeps max peak and replaces last speed", async () => {
  const { service, repository } = setup();
  await service.openSpeedingEvent(speeding(at(0), 70));
  assert.equal((await service.updateSpeedingEvent(active(at(1), 100))).outcome, "UPDATED");
  await service.updateSpeedingEvent(active(at(2), 80));
  const event = repository.events[0] as SpeedingAlertEventRecord;
  assert.equal(event.lastSpeedKph, 80); assert.equal(event.peakSpeedKph, 100);
});

test("inactivity ACTIVE keeps minimum distance and replaces last distance", async () => {
  const { service, repository } = setup();
  await service.openInactivityEvent(inactivity(at(0), 20));
  await service.updateInactivityEvent({ type: "INACTIVITY", vehicleId: VEHICLE_A, observedAt: at(1), traveledDistanceMeters: 5 });
  await service.updateInactivityEvent({ type: "INACTIVITY", vehicleId: VEHICLE_A, observedAt: at(2), traveledDistanceMeters: 15 });
  const event = repository.events[0] as InactivityAlertEventRecord;
  assert.equal(event.lastTraveledDistanceMeters, 15); assert.equal(event.minimumTraveledDistanceMeters, 5);
});

test("ACTIVE and CLEAR without OPEN are idempotent NOOP", async () => {
  const { service } = setup();
  assert.deepEqual(await service.updateSpeedingEvent(active(at(1))), { outcome: "NOOP", reason: "MISSING_OPEN_EVENT" });
  assert.deepEqual(await service.resolveInactivityEvent({ type: "INACTIVITY", vehicleId: VEHICLE_A, observedAt: at(1), traveledDistanceMeters: 300 }), { outcome: "NOOP", reason: "MISSING_OPEN_EVENT" });
});

test("CLEAR resolves, timestamps, updates safe metrics, and releases activeKey", async () => {
  const { service, repository } = setup();
  await service.openSpeedingEvent(speeding(at(0), 70));
  assert.equal((await service.resolveSpeedingEvent({ type: "SPEEDING", vehicleId: VEHICLE_A, observedAt: at(1), speedKph: 40 })).outcome, "RESOLVED");
  const event = repository.events[0] as SpeedingAlertEventRecord;
  assert.equal(event.status, "RESOLVED"); assert.equal(event.resolvedAt?.getTime(), at(1).getTime()); assert.equal(event.lastObservedAt.getTime(), at(1).getTime()); assert.equal(event.activeKey, null); assert.equal(event.lastSpeedKph, 40); assert.equal(event.peakSpeedKph, 70);
});

test("stale and same-timestamp ACTIVE do not mutate", async () => {
  const { service, repository } = setup();
  await service.openSpeedingEvent(speeding(at(2), 70));
  assert.deepEqual(await service.updateSpeedingEvent(active(at(1), 100, at(0))), { outcome: "NOOP", reason: "STALE" });
  assert.deepEqual(await service.updateSpeedingEvent(active(at(2), 100, at(0))), { outcome: "NOOP", reason: "STALE" });
  const event = repository.events[0] as SpeedingAlertEventRecord;
  assert.equal(event.lastSpeedKph, 70); assert.equal(event.peakSpeedKph, 70);
});

test("stale and same-timestamp CLEAR do not resolve", async () => {
  const { service, repository } = setup();
  await service.openInactivityEvent(inactivity(at(2), 20));
  for (const observedAt of [at(1), at(2)]) assert.deepEqual(await service.resolveInactivityEvent({ type: "INACTIVITY", vehicleId: VEHICLE_A, observedAt, traveledDistanceMeters: 400 }), { outcome: "NOOP", reason: "STALE" });
  assert.equal(repository.events[0]!.status, "OPEN"); assert.equal(repository.events[0]!.resolvedAt, null);
});
