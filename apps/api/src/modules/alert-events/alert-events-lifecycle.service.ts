import { Inject, Injectable } from "@nestjs/common";
import { createAlertEventActiveKey, createAlertEventDedupeKey } from "./alert-events.keys";
import type { AlertEventsRepository } from "./alert-events.repository";
import { ALERT_EVENTS_REPOSITORY } from "./alert-events.tokens";
import type { AlertEventLifecycleResult, OpenInactivityEventCommand, OpenSpeedingEventCommand, ResolveAlertEventCommand, ResolveSpeedingEventCommand, UpdateAlertEventCommand, UpdateInactivityEventCommand, UpdateSpeedingEventCommand } from "./alert-events.types";
import { validateOpenAlertEventCommand, validateResolveAlertEventCommand, validateUpdateAlertEventCommand } from "./alert-events.validation";

const MAX_OPTIMISTIC_ATTEMPTS = 8;

export class AlertEventConcurrencyError extends Error {
  public constructor() {
    super("Alert event changed too frequently to complete the lifecycle operation");
    this.name = "AlertEventConcurrencyError";
  }
}

@Injectable()
export class AlertEventsLifecycleService {
  public constructor(@Inject(ALERT_EVENTS_REPOSITORY) private readonly repository: AlertEventsRepository) {}

  public openSpeedingEvent(command: OpenSpeedingEventCommand): Promise<AlertEventLifecycleResult> {
    return this.open(validateOpenAlertEventCommand(command));
  }

  public openInactivityEvent(command: OpenInactivityEventCommand): Promise<AlertEventLifecycleResult> {
    return this.open(validateOpenAlertEventCommand(command));
  }

  public updateSpeedingEvent(command: UpdateSpeedingEventCommand): Promise<AlertEventLifecycleResult> {
    return this.update(validateUpdateAlertEventCommand(command));
  }

  public updateInactivityEvent(command: UpdateInactivityEventCommand): Promise<AlertEventLifecycleResult> {
    return this.update(validateUpdateAlertEventCommand(command));
  }

  public resolveSpeedingEvent(command: ResolveSpeedingEventCommand): Promise<AlertEventLifecycleResult> {
    return this.resolve(validateResolveAlertEventCommand(command));
  }

  public resolveInactivityEvent(command: UpdateInactivityEventCommand): Promise<AlertEventLifecycleResult> {
    return this.resolve(validateResolveAlertEventCommand(command));
  }

  private async open(command: ReturnType<typeof validateOpenAlertEventCommand>): Promise<AlertEventLifecycleResult> {
    const dedupeKey = createAlertEventDedupeKey(command.type, command.vehicleId, command.observedAt);
    const result = await this.repository.registerConfirmation({ command, dedupeKey, activeKey: createAlertEventActiveKey(command.type, command.vehicleId) });
    if (result.outcome === "CREATED") return Object.freeze({ outcome: result.outcome, eventId: result.event.id });
    if (result.outcome === "ALREADY_EXISTS") return Object.freeze(result);
    return Object.freeze({ outcome: result.outcome, eventId: result.event.id, updated: result.updated });
  }

  private async update(command: UpdateAlertEventCommand): Promise<AlertEventLifecycleResult> {
    for (let attempt = 0; attempt < MAX_OPTIMISTIC_ATTEMPTS; attempt += 1) {
      const event = await this.repository.findOpenByVehicleAndType(command.vehicleId, command.type);
      if (event === null) return Object.freeze({ outcome: "NOOP", reason: "MISSING_OPEN_EVENT" });
      if (command.observedAt.getTime() < event.lastObservedAt.getTime()) return Object.freeze({ outcome: "NOOP", reason: "STALE" });
      if (command.observedAt.getTime() === event.lastObservedAt.getTime()) {
        if (command.type === "SPEEDING" && await this.repository.verifySpeedingUpdateApplied(event, command)) return Object.freeze({ outcome: "ALREADY_APPLIED", eventId: event.id });
        return Object.freeze({ outcome: "NOOP", reason: "STALE" });
      }
      if (await this.repository.updateOpen({ event, command })) return Object.freeze({ outcome: "UPDATED", eventId: event.id });
    }
    throw new AlertEventConcurrencyError();
  }

  private async resolve(command: ResolveAlertEventCommand): Promise<AlertEventLifecycleResult> {
    for (let attempt = 0; attempt < MAX_OPTIMISTIC_ATTEMPTS; attempt += 1) {
      const event = await this.repository.findOpenByVehicleAndType(command.vehicleId, command.type);
      if (event === null) return Object.freeze({ outcome: "NOOP", reason: "MISSING_OPEN_EVENT" });
      if (command.observedAt.getTime() <= event.lastObservedAt.getTime()) return Object.freeze({ outcome: "NOOP", reason: "STALE" });
      if (await this.repository.resolveOpen({ event, command })) return Object.freeze({ outcome: "RESOLVED", eventId: event.id });
    }
    throw new AlertEventConcurrencyError();
  }

}
