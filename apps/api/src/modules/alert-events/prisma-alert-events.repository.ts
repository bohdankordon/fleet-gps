import { Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import { AlertEventSpeedZone, AlertEventStatus, AlertEventType, AlertNotificationKind, Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database";
import { type AlertNotificationRecipientPlanning, AlertNotificationRecipientPlanner } from "../alert-notifications/alert-notification-recipient-planner.service";
import type { AlertEventRecord, AlertEventType as DomainAlertEventType, InactivityAlertEventRecord, OpenAlertEventCommand, SpeedingAlertEventRecord, UpdateAlertEventCommand, UpdateSpeedingEventCommand } from "./alert-events.types";
import { AlertEventPersistenceStateError, AlertEventUniqueConflictError, type AlertEventsRepository, type ConditionalAlertEventMutation, type RegisterAlertEventConfirmationInput, type RegisterAlertEventConfirmationResult } from "./alert-events.repository";
import { createAlertEventDedupeKey } from "./alert-events.keys";

const MAX_REGISTRATION_ATTEMPTS = 8;
const MAX_OPTIMISTIC_ATTEMPTS = 8;
const TRANSACTION_TIMEOUT_MS = 30_000;

type LegacyOutboxCreationConfig = Readonly<{ telegramNotifications: Readonly<Pick<ApiConfig["telegramNotifications"], "enabled">> }>;

const alertEventSelect = {
  id: true,
  vehicleId: true,
  type: true,
  status: true,
  confirmedAt: true,
  lastObservedAt: true,
  resolvedAt: true,
  dedupeKey: true,
  activeKey: true,
  speedZone: true,
  confirmationSpeedKph: true,
  confirmationLatitude: true,
  confirmationLongitude: true,
  lastSpeedKph: true,
  peakSpeedKph: true,
  speedThresholdKph: true,
  confirmationTraveledDistanceMeters: true,
  lastTraveledDistanceMeters: true,
  minimumTraveledDistanceMeters: true,
  distanceThresholdMeters: true,
  durationThresholdMinutes: true,
} satisfies Prisma.AlertEventSelect;

type StoredAlertEvent = Prisma.AlertEventGetPayload<{ select: typeof alertEventSelect }>;
type PersistenceClient = Pick<Prisma.TransactionClient, "alertEvent" | "alertEventConfirmation" | "alertNotificationOutbox">;

const confirmationEvidenceSelect = { eventId: true, observedAt: true, speedingStreakStartedAt: true, speedingStreakStartLatitude: true, speedingStreakStartLongitude: true, lastSpeedingObservedAt: true, lastSpeedingLatitude: true, lastSpeedingLongitude: true } satisfies Prisma.AlertEventConfirmationSelect;
type StoredConfirmationEvidence = Prisma.AlertEventConfirmationGetPayload<{ select: typeof confirmationEvidenceSelect }>;

function requireNumber(value: number | null, field: string): number {
  if (value === null || !Number.isFinite(value)) throw new AlertEventPersistenceStateError(`Invalid persisted ${field}`);
  return value;
}

function toDomain(row: StoredAlertEvent): AlertEventRecord {
  const base = { id: row.id, vehicleId: row.vehicleId, status: row.status, confirmedAt: row.confirmedAt, lastObservedAt: row.lastObservedAt, resolvedAt: row.resolvedAt, dedupeKey: row.dedupeKey, activeKey: row.activeKey } as const;
  if (row.type === AlertEventType.SPEEDING) {
    if (row.speedZone === null) throw new AlertEventPersistenceStateError("Invalid persisted speedZone");
    return Object.freeze({ ...base, type: "SPEEDING", speedZone: row.speedZone, confirmationSpeedKph: requireNumber(row.confirmationSpeedKph, "confirmationSpeedKph"), confirmationLatitude: row.confirmationLatitude, confirmationLongitude: row.confirmationLongitude, lastSpeedKph: requireNumber(row.lastSpeedKph, "lastSpeedKph"), peakSpeedKph: requireNumber(row.peakSpeedKph, "peakSpeedKph"), speedThresholdKph: requireNumber(row.speedThresholdKph, "speedThresholdKph") } satisfies SpeedingAlertEventRecord);
  }
  return Object.freeze({ ...base, type: "INACTIVITY", confirmationTraveledDistanceMeters: requireNumber(row.confirmationTraveledDistanceMeters, "confirmationTraveledDistanceMeters"), lastTraveledDistanceMeters: requireNumber(row.lastTraveledDistanceMeters, "lastTraveledDistanceMeters"), minimumTraveledDistanceMeters: requireNumber(row.minimumTraveledDistanceMeters, "minimumTraveledDistanceMeters"), distanceThresholdMeters: requireNumber(row.distanceThresholdMeters, "distanceThresholdMeters"), durationThresholdMinutes: requireNumber(row.durationThresholdMinutes, "durationThresholdMinutes") } satisfies InactivityAlertEventRecord);
}

function domainType(type: DomainAlertEventType): AlertEventType {
  return type === "SPEEDING" ? AlertEventType.SPEEDING : AlertEventType.INACTIVITY;
}

function conflictTarget(error: Prisma.PrismaClientKnownRequestError): string[] {
  const target = error.meta?.target;
  if (typeof target === "string") return [target];
  if (Array.isArray(target)) return target.filter((value): value is string => typeof value === "string");
  const driverAdapterError = error.meta?.driverAdapterError;
  if (typeof driverAdapterError !== "object" || driverAdapterError === null) return [];
  const cause = (driverAdapterError as { cause?: unknown }).cause;
  if (typeof cause !== "object" || cause === null) return [];
  const constraint = (cause as { constraint?: unknown }).constraint;
  if (typeof constraint !== "object" || constraint === null) return [];
  const fields = (constraint as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return [];
  return fields.filter((value): value is string => typeof value === "string");
}

function mapUniqueConflict(error: unknown): AlertEventUniqueConflictError | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return null;
  const targets = conflictTarget(error);
  const modelName = typeof error.meta?.modelName === "string" ? error.meta.modelName : "";
  if (targets.some((target) => target === "activeKey" || target === "active_key" || target === "alert_events_active_key_key")) return new AlertEventUniqueConflictError("ACTIVE_KEY", { cause: error });
  if (targets.some((target) => target === "alert_event_confirmations_pkey") || modelName === "AlertEventConfirmation") return new AlertEventUniqueConflictError("RECEIPT_DEDUPE_KEY", { cause: error });
  if (targets.some((target) => target === "dedupeKey" || target === "dedupe_key" || target === "alert_events_dedupe_key_key")) return new AlertEventUniqueConflictError("EVENT_DEDUPE_KEY", { cause: error });
  return null;
}

function confirmationAsUpdate(command: OpenAlertEventCommand): UpdateAlertEventCommand {
  return command.type === "SPEEDING"
    ? Object.freeze({ type: command.type, vehicleId: command.vehicleId, observedAt: command.observedAt, speedKph: command.speedKph, latitude: command.confirmationLatitude, longitude: command.confirmationLongitude, confirmationObservedAt: command.observedAt })
    : Object.freeze({ type: command.type, vehicleId: command.vehicleId, observedAt: command.observedAt, traveledDistanceMeters: command.traveledDistanceMeters });
}

function confirmationData(command: OpenAlertEventCommand, dedupeKey: string, eventId: string): Prisma.AlertEventConfirmationUncheckedCreateInput {
  return command.type === "SPEEDING"
    ? { dedupeKey, eventId, observedAt: command.observedAt, speedingStreakStartedAt: command.speedingStreakStartedAt, speedingStreakStartLatitude: command.speedingStreakStartLatitude, speedingStreakStartLongitude: command.speedingStreakStartLongitude, lastSpeedingObservedAt: command.observedAt, lastSpeedingLatitude: command.confirmationLatitude, lastSpeedingLongitude: command.confirmationLongitude }
    : { dedupeKey, eventId, observedAt: command.observedAt };
}

function sameConfirmationEvidence(row: StoredConfirmationEvidence, command: OpenAlertEventCommand): boolean {
  if (row.observedAt.getTime() !== command.observedAt.getTime()) return false;
  if (command.type === "INACTIVITY") return row.speedingStreakStartedAt === null && row.speedingStreakStartLatitude === null && row.speedingStreakStartLongitude === null && row.lastSpeedingObservedAt === null && row.lastSpeedingLatitude === null && row.lastSpeedingLongitude === null;
  const lastSpeedingMs = row.lastSpeedingObservedAt?.getTime();
  return row.speedingStreakStartedAt?.getTime() === command.speedingStreakStartedAt.getTime()
    && row.speedingStreakStartLatitude === command.speedingStreakStartLatitude
    && row.speedingStreakStartLongitude === command.speedingStreakStartLongitude
    && lastSpeedingMs !== undefined
    && lastSpeedingMs >= command.observedAt.getTime()
    && (lastSpeedingMs > command.observedAt.getTime() || (row.lastSpeedingLatitude === command.confirmationLatitude && row.lastSpeedingLongitude === command.confirmationLongitude));
}

@Injectable()
export class PrismaAlertEventsRepository implements AlertEventsRepository {
  public constructor(
    private readonly database: DatabaseService,
    @Inject(API_CONFIG) private readonly config: LegacyOutboxCreationConfig,
    @Inject(AlertNotificationRecipientPlanner) private readonly recipientPlanner: AlertNotificationRecipientPlanning = { plan: async (): Promise<void> => {} },
  ) {}

  public async registerConfirmation(input: RegisterAlertEventConfirmationInput): Promise<RegisterAlertEventConfirmationResult> {
    const client = this.database.getClient();
    if (typeof (client as unknown as { $transaction?: unknown }).$transaction !== "function") {
      return this.registerInTransaction(client as unknown as Prisma.TransactionClient, input);
    }
    for (let attempt = 0; attempt < MAX_REGISTRATION_ATTEMPTS; attempt += 1) {
      try {
        return await client.$transaction((transaction) => this.registerInTransaction(transaction, input), { timeout: TRANSACTION_TIMEOUT_MS });
      } catch (error) {
        const conflict = mapUniqueConflict(error);
        if (conflict === null) throw error;
        const exact = await this.findReceipt(client, input.dedupeKey);
        if (exact !== null) {
          if (!sameConfirmationEvidence(exact, input.command)) throw new AlertEventPersistenceStateError("Confirmation dedupe key has contradictory evidence");
          return Object.freeze({ outcome: "ALREADY_EXISTS", eventId: exact.eventId });
        }
        await this.findOpenWithClient(client, input.command.vehicleId, input.command.type);
      }
    }
    throw new AlertEventPersistenceStateError("Confirmation registration concurrency limit exceeded");
  }

  public findOpenByVehicleAndType(vehicleId: string, type: DomainAlertEventType): Promise<AlertEventRecord | null> {
    return this.findOpenWithClient(this.database.getClient(), vehicleId, type);
  }

  public updateOpen(input: ConditionalAlertEventMutation<import("./alert-events.types").UpdateAlertEventCommand>): Promise<boolean> {
    const client = this.database.getClient();
    if (input.command.type !== "SPEEDING" || typeof (client as unknown as { $transaction?: unknown }).$transaction !== "function") return this.updateOpenWithClient(client, input);
    return client.$transaction((transaction) => this.updateOpenWithClient(transaction, input), { timeout: TRANSACTION_TIMEOUT_MS });
  }

  public resolveOpen(input: ConditionalAlertEventMutation<import("./alert-events.types").ResolveAlertEventCommand>): Promise<boolean> {
    return this.resolveOpenWithClient(this.database.getClient(), input);
  }

  public async verifySpeedingUpdateApplied(event: AlertEventRecord, command: UpdateSpeedingEventCommand): Promise<boolean> {
    if (event.type !== "SPEEDING" || event.lastObservedAt.getTime() !== command.observedAt.getTime() || event.lastSpeedKph !== command.speedKph) throw new AlertEventPersistenceStateError("Equal-timestamp speeding event state is contradictory");
    const dedupeKey = createAlertEventDedupeKey("SPEEDING", command.vehicleId, command.confirmationObservedAt);
    const receipt = await this.database.getClient().alertEventConfirmation.findUnique({ where: { dedupeKey }, select: confirmationEvidenceSelect });
    if (receipt === null || receipt.eventId !== event.id || receipt.observedAt.getTime() !== command.confirmationObservedAt.getTime() || receipt.lastSpeedingObservedAt?.getTime() !== command.observedAt.getTime() || receipt.lastSpeedingLatitude !== command.latitude || receipt.lastSpeedingLongitude !== command.longitude) throw new AlertEventPersistenceStateError("Equal-timestamp speeding segment state is contradictory");
    return true;
  }

  private async registerInTransaction(transaction: Prisma.TransactionClient, input: RegisterAlertEventConfirmationInput): Promise<RegisterAlertEventConfirmationResult> {
    const exact = await this.findReceipt(transaction, input.dedupeKey);
    if (exact !== null) {
      if (!sameConfirmationEvidence(exact, input.command)) throw new AlertEventPersistenceStateError("Confirmation dedupe key has contradictory evidence");
      return Object.freeze({ outcome: "ALREADY_EXISTS", eventId: exact.eventId });
    }

    const existing = await this.findOpenWithClient(transaction, input.command.vehicleId, input.command.type);
    if (existing !== null) {
      await transaction.alertEventConfirmation.create({ data: confirmationData(input.command, input.dedupeKey, existing.id) });
      const updated = await this.touchExistingInTransaction(transaction, existing, confirmationAsUpdate(input.command));
      return Object.freeze({ outcome: "ALREADY_OPEN", event: existing, updated });
    }

    const created = await this.createOpenWithClient(transaction, input);
    await transaction.alertEventConfirmation.create({ data: confirmationData(input.command, input.dedupeKey, created.id) });
    if (this.config.telegramNotifications.enabled) {
      await transaction.alertNotificationOutbox.create({ data: { alertEventId: created.id, kind: AlertNotificationKind.ALERT_CONFIRMED } });
    }
    await this.recipientPlanner.plan(transaction, created);
    return Object.freeze({ outcome: "CREATED", event: created });
  }

  private findReceipt(client: PersistenceClient, dedupeKey: string): Promise<StoredConfirmationEvidence | null> {
    return client.alertEventConfirmation.findUnique({ where: { dedupeKey }, select: confirmationEvidenceSelect });
  }

  private async findOpenWithClient(client: PersistenceClient, vehicleId: string, type: DomainAlertEventType): Promise<AlertEventRecord | null> {
    const row = await client.alertEvent.findFirst({ where: { vehicleId, type: domainType(type), status: AlertEventStatus.OPEN }, select: alertEventSelect });
    return row === null ? null : toDomain(row);
  }

  private async createOpenWithClient(client: PersistenceClient, input: RegisterAlertEventConfirmationInput): Promise<AlertEventRecord> {
    const common = { vehicleId: input.command.vehicleId, type: domainType(input.command.type), status: AlertEventStatus.OPEN, confirmedAt: input.command.observedAt, lastObservedAt: input.command.observedAt, dedupeKey: input.dedupeKey, activeKey: input.activeKey } as const;
    const data: Prisma.AlertEventUncheckedCreateInput = input.command.type === "SPEEDING"
      ? { ...common, speedZone: input.command.zone === "CITY" ? AlertEventSpeedZone.CITY : AlertEventSpeedZone.OUTSIDE_CITY, confirmationSpeedKph: input.command.speedKph, confirmationLatitude: input.command.confirmationLatitude, confirmationLongitude: input.command.confirmationLongitude, lastSpeedKph: input.command.speedKph, peakSpeedKph: input.command.speedKph, speedThresholdKph: input.command.speedThresholdKph }
      : { ...common, confirmationTraveledDistanceMeters: input.command.traveledDistanceMeters, lastTraveledDistanceMeters: input.command.traveledDistanceMeters, minimumTraveledDistanceMeters: input.command.traveledDistanceMeters, distanceThresholdMeters: input.command.distanceThresholdMeters, durationThresholdMinutes: input.command.durationThresholdMinutes };
    return toDomain(await client.alertEvent.create({ data, select: alertEventSelect }));
  }

  private async touchExistingInTransaction(transaction: Prisma.TransactionClient, event: AlertEventRecord, command: UpdateAlertEventCommand): Promise<boolean> {
    let current = event;
    for (let attempt = 0; attempt < MAX_OPTIMISTIC_ATTEMPTS; attempt += 1) {
      if (command.observedAt.getTime() <= current.lastObservedAt.getTime()) return false;
      if (await this.updateOpenWithClient(transaction, { event: current, command })) return true;
      const refreshed = await this.findOpenWithClient(transaction, command.vehicleId, command.type);
      if (refreshed === null) return false;
      current = refreshed;
    }
    throw new AlertEventPersistenceStateError("Confirmation metric concurrency limit exceeded");
  }

  private async updateOpenWithClient(client: PersistenceClient, input: ConditionalAlertEventMutation<import("./alert-events.types").UpdateAlertEventCommand>): Promise<boolean> {
    const data: Prisma.AlertEventUpdateManyMutationInput = input.command.type === "SPEEDING"
      ? { lastObservedAt: input.command.observedAt, lastSpeedKph: input.command.speedKph, peakSpeedKph: Math.max((input.event as SpeedingAlertEventRecord).peakSpeedKph, input.command.speedKph) }
      : { lastObservedAt: input.command.observedAt, lastTraveledDistanceMeters: input.command.traveledDistanceMeters, minimumTraveledDistanceMeters: Math.min((input.event as InactivityAlertEventRecord).minimumTraveledDistanceMeters, input.command.traveledDistanceMeters) };
    const result = await client.alertEvent.updateMany({ where: { id: input.event.id, status: AlertEventStatus.OPEN, lastObservedAt: input.event.lastObservedAt }, data });
    if (result.count !== 1) return false;
    if (input.command.type === "SPEEDING") {
      const dedupeKey = createAlertEventDedupeKey("SPEEDING", input.command.vehicleId, input.command.confirmationObservedAt);
      const receipt = await client.alertEventConfirmation.updateMany({
        where: { dedupeKey, eventId: input.event.id, observedAt: input.command.confirmationObservedAt, speedingStreakStartedAt: { not: null }, lastSpeedingObservedAt: { lte: input.command.observedAt } },
        data: { lastSpeedingObservedAt: input.command.observedAt, lastSpeedingLatitude: input.command.latitude, lastSpeedingLongitude: input.command.longitude },
      });
      if (receipt.count !== 1) throw new AlertEventPersistenceStateError("Exact speeding confirmation receipt is missing or invalid");
    }
    return true;
  }

  private async resolveOpenWithClient(client: PersistenceClient, input: ConditionalAlertEventMutation<import("./alert-events.types").ResolveAlertEventCommand>): Promise<boolean> {
    const metricData: Prisma.AlertEventUpdateManyMutationInput = input.command.type === "SPEEDING"
      ? { lastSpeedKph: input.command.speedKph, peakSpeedKph: Math.max((input.event as SpeedingAlertEventRecord).peakSpeedKph, input.command.speedKph) }
      : { lastTraveledDistanceMeters: input.command.traveledDistanceMeters, minimumTraveledDistanceMeters: Math.min((input.event as InactivityAlertEventRecord).minimumTraveledDistanceMeters, input.command.traveledDistanceMeters) };
    const result = await client.alertEvent.updateMany({ where: { id: input.event.id, status: AlertEventStatus.OPEN, lastObservedAt: input.event.lastObservedAt }, data: { ...metricData, status: AlertEventStatus.RESOLVED, resolvedAt: input.command.observedAt, lastObservedAt: input.command.observedAt, activeKey: null } });
    return result.count === 1;
  }
}

export const alertEventRepositoryInternals = Object.freeze({ mapUniqueConflict });
