import { Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import { AlertEventSpeedZone, AlertEventStatus, AlertEventType, AlertNotificationKind, Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database";
import { type AlertNotificationRecipientPlanning, AlertNotificationRecipientPlanner } from "../alert-notifications/alert-notification-recipient-planner.service";
import type { AlertEventRecord, AlertEventType as DomainAlertEventType, InactivityAlertEventRecord, OpenAlertEventCommand, SpeedingAlertEventRecord, UpdateAlertEventCommand } from "./alert-events.types";
import { AlertEventPersistenceStateError, AlertEventUniqueConflictError, type AlertEventsRepository, type ConditionalAlertEventMutation, type RegisterAlertEventConfirmationInput, type RegisterAlertEventConfirmationResult } from "./alert-events.repository";

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
    ? Object.freeze({ type: command.type, vehicleId: command.vehicleId, observedAt: command.observedAt, speedKph: command.speedKph })
    : Object.freeze({ type: command.type, vehicleId: command.vehicleId, observedAt: command.observedAt, traveledDistanceMeters: command.traveledDistanceMeters });
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
        const exactEventId = await this.findReceiptEventId(client, input.dedupeKey);
        if (exactEventId !== null) return Object.freeze({ outcome: "ALREADY_EXISTS", eventId: exactEventId });
        await this.findOpenWithClient(client, input.command.vehicleId, input.command.type);
      }
    }
    throw new AlertEventPersistenceStateError("Confirmation registration concurrency limit exceeded");
  }

  public findOpenByVehicleAndType(vehicleId: string, type: DomainAlertEventType): Promise<AlertEventRecord | null> {
    return this.findOpenWithClient(this.database.getClient(), vehicleId, type);
  }

  public updateOpen(input: ConditionalAlertEventMutation<import("./alert-events.types").UpdateAlertEventCommand>): Promise<boolean> {
    return this.updateOpenWithClient(this.database.getClient(), input);
  }

  public resolveOpen(input: ConditionalAlertEventMutation<import("./alert-events.types").ResolveAlertEventCommand>): Promise<boolean> {
    return this.resolveOpenWithClient(this.database.getClient(), input);
  }

  private async registerInTransaction(transaction: Prisma.TransactionClient, input: RegisterAlertEventConfirmationInput): Promise<RegisterAlertEventConfirmationResult> {
    const exactEventId = await this.findReceiptEventId(transaction, input.dedupeKey);
    if (exactEventId !== null) return Object.freeze({ outcome: "ALREADY_EXISTS", eventId: exactEventId });

    const existing = await this.findOpenWithClient(transaction, input.command.vehicleId, input.command.type);
    if (existing !== null) {
      await transaction.alertEventConfirmation.create({ data: { dedupeKey: input.dedupeKey, eventId: existing.id, observedAt: input.command.observedAt } });
      const updated = await this.touchExistingInTransaction(transaction, existing, confirmationAsUpdate(input.command));
      return Object.freeze({ outcome: "ALREADY_OPEN", event: existing, updated });
    }

    const created = await this.createOpenWithClient(transaction, input);
    await transaction.alertEventConfirmation.create({ data: { dedupeKey: input.dedupeKey, eventId: created.id, observedAt: input.command.observedAt } });
    if (this.config.telegramNotifications.enabled) {
      await transaction.alertNotificationOutbox.create({ data: { alertEventId: created.id, kind: AlertNotificationKind.ALERT_CONFIRMED } });
    }
    await this.recipientPlanner.plan(transaction, created);
    return Object.freeze({ outcome: "CREATED", event: created });
  }

  private async findReceiptEventId(client: PersistenceClient, dedupeKey: string): Promise<string | null> {
    const receipt = await client.alertEventConfirmation.findUnique({ where: { dedupeKey }, select: { eventId: true } });
    return receipt?.eventId ?? null;
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
    return result.count === 1;
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
