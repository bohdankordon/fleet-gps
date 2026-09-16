import type { AlertEventRecord, AlertEventType, OpenAlertEventCommand, ResolveAlertEventCommand, UpdateAlertEventCommand, UpdateSpeedingEventCommand } from "./alert-events.types";

export type RegisterAlertEventConfirmationInput = Readonly<{
  command: OpenAlertEventCommand;
  dedupeKey: string;
  activeKey: string;
}>;

export type RegisterAlertEventConfirmationResult =
  | Readonly<{ outcome: "CREATED"; event: AlertEventRecord }>
  | Readonly<{ outcome: "ALREADY_EXISTS"; eventId: string }>
  | Readonly<{ outcome: "ALREADY_OPEN"; event: AlertEventRecord; updated: boolean }>;

export type ConditionalAlertEventMutation<TCommand extends UpdateAlertEventCommand | ResolveAlertEventCommand> = Readonly<{
  event: AlertEventRecord;
  command: TCommand;
}>;

export interface AlertEventsRepository {
  registerConfirmation(input: RegisterAlertEventConfirmationInput): Promise<RegisterAlertEventConfirmationResult>;
  findOpenByVehicleAndType(vehicleId: string, type: AlertEventType): Promise<AlertEventRecord | null>;
  updateOpen(input: ConditionalAlertEventMutation<UpdateAlertEventCommand>): Promise<boolean>;
  resolveOpen(input: ConditionalAlertEventMutation<ResolveAlertEventCommand>): Promise<boolean>;
  verifySpeedingUpdateApplied(event: AlertEventRecord, command: UpdateSpeedingEventCommand): Promise<boolean>;
}

export type AlertEventUniqueConflict = "RECEIPT_DEDUPE_KEY" | "EVENT_DEDUPE_KEY" | "ACTIVE_KEY";

export class AlertEventUniqueConflictError extends Error {
  public constructor(public readonly conflict: AlertEventUniqueConflict, options?: ErrorOptions) {
    super(`Alert event unique conflict: ${conflict}`, options);
    this.name = "AlertEventUniqueConflictError";
  }
}

export class AlertEventPersistenceStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AlertEventPersistenceStateError";
  }
}
