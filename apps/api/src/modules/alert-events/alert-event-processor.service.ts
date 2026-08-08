import { Injectable } from "@nestjs/common";
import type { InactivityDetectionResult, InactivityDetectorStatus } from "../inactivity-detector";
import type { SpeedingDetectionResult, SpeedingDetectorStatus } from "../speeding-detector";
import { mapInactivityDetectionToAlertEventAction, mapSpeedingDetectionToAlertEventAction } from "./alert-events.mapper";
import type { AlertEventLifecycleResult, AlertEventType } from "./alert-events.types";
import { AlertEventsLifecycleService } from "./alert-events-lifecycle.service";

export type AlertEventProcessingAction = "NONE" | "OPEN" | "UPDATE" | "RESOLVE";
export type AlertEventPersistenceOutcome = AlertEventLifecycleResult["outcome"];

type ProcessingResult<TEventType extends AlertEventType, TDetectorStatus extends string> = Readonly<{
  eventType: TEventType;
  detectorStatus: TDetectorStatus;
  action: AlertEventProcessingAction;
  persistenceOutcome: AlertEventPersistenceOutcome | null;
  eventId: string | null;
  databaseWriteAttempted: boolean;
  lifecycleResult: AlertEventLifecycleResult | null;
}>;

export type SpeedingAlertEventProcessingResult = ProcessingResult<"SPEEDING", SpeedingDetectorStatus>;
export type InactivityAlertEventProcessingResult = ProcessingResult<"INACTIVITY", InactivityDetectorStatus>;

function none<TEventType extends AlertEventType, TDetectorStatus extends string>(
  eventType: TEventType,
  detectorStatus: TDetectorStatus,
): ProcessingResult<TEventType, TDetectorStatus> {
  return Object.freeze({
    eventType,
    detectorStatus,
    action: "NONE",
    persistenceOutcome: null,
    eventId: null,
    databaseWriteAttempted: false,
    lifecycleResult: null,
  });
}

function processed<TEventType extends AlertEventType, TDetectorStatus extends string>(
  eventType: TEventType,
  detectorStatus: TDetectorStatus,
  action: Exclude<AlertEventProcessingAction, "NONE">,
  lifecycleResult: AlertEventLifecycleResult,
): ProcessingResult<TEventType, TDetectorStatus> {
  return Object.freeze({
    eventType,
    detectorStatus,
    action,
    persistenceOutcome: lifecycleResult.outcome,
    eventId: "eventId" in lifecycleResult ? lifecycleResult.eventId : null,
    databaseWriteAttempted: true,
    lifecycleResult,
  });
}

@Injectable()
export class AlertEventProcessorService {
  public constructor(private readonly lifecycle: AlertEventsLifecycleService) {}

  public async processSpeedingResult(result: SpeedingDetectionResult): Promise<SpeedingAlertEventProcessingResult> {
    const mapped = mapSpeedingDetectionToAlertEventAction(result);
    if (mapped.kind === "NONE") return none("SPEEDING", result.status);
    if (mapped.command.type !== "SPEEDING") throw new TypeError("Speeding detector mapped to a non-speeding alert event command");

    const lifecycleResult = mapped.kind === "OPEN"
      ? await this.lifecycle.openSpeedingEvent(mapped.command)
      : mapped.kind === "UPDATE"
        ? await this.lifecycle.updateSpeedingEvent(mapped.command)
        : await this.lifecycle.resolveSpeedingEvent(mapped.command);
    return processed("SPEEDING", result.status, mapped.kind, lifecycleResult);
  }

  public async processInactivityResult(result: InactivityDetectionResult): Promise<InactivityAlertEventProcessingResult> {
    const mapped = mapInactivityDetectionToAlertEventAction(result);
    if (mapped.kind === "NONE") return none("INACTIVITY", result.status);
    if (mapped.command.type !== "INACTIVITY") throw new TypeError("Inactivity detector mapped to a non-inactivity alert event command");

    const lifecycleResult = mapped.kind === "OPEN"
      ? await this.lifecycle.openInactivityEvent(mapped.command)
      : mapped.kind === "UPDATE"
        ? await this.lifecycle.updateInactivityEvent(mapped.command)
        : await this.lifecycle.resolveInactivityEvent(mapped.command);
    return processed("INACTIVITY", result.status, mapped.kind, lifecycleResult);
  }
}
