import type { OpenAlertEventCommand, ResolveAlertEventCommand, UpdateAlertEventCommand } from "./alert-events.types";
import { normalizeUuid } from "../../common/uuid.validation";

export class AlertEventValidationError extends Error {
  public constructor(public readonly field: string) {
    super(`Invalid alert event field: ${field}`);
    this.name = "AlertEventValidationError";
  }
}

function vehicleId(value: string): string {
  const normalized = normalizeUuid(value);
  if (normalized === null) throw new AlertEventValidationError("vehicleId");
  return normalized;
}

function observedAt(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new AlertEventValidationError("observedAt");
  return new Date(value.getTime());
}

function nonNegative(value: number, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new AlertEventValidationError(field);
  return value;
}

function positive(value: number, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new AlertEventValidationError(field);
  return value;
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new AlertEventValidationError(field);
  return value;
}

function rejectKeys(value: object, keys: readonly string[]): void {
  for (const key of keys) if (key in value) throw new AlertEventValidationError(key);
}

export function validateOpenAlertEventCommand(command: OpenAlertEventCommand): OpenAlertEventCommand {
  if (command.type === "SPEEDING") {
    rejectKeys(command, ["traveledDistanceMeters", "distanceThresholdMeters", "durationThresholdMinutes"]);
    if (command.zone !== "CITY" && command.zone !== "OUTSIDE_CITY") throw new AlertEventValidationError("zone");
    const speedKph = nonNegative(command.speedKph, "speedKph");
    const speedThresholdKph = positive(command.speedThresholdKph, "speedThresholdKph");
    if (speedKph <= speedThresholdKph) throw new AlertEventValidationError("speedKph");
    return Object.freeze({ type: command.type, vehicleId: vehicleId(command.vehicleId), observedAt: observedAt(command.observedAt), zone: command.zone, speedKph, speedThresholdKph });
  }
  if (command.type === "INACTIVITY") {
    rejectKeys(command, ["zone", "speedKph", "speedThresholdKph"]);
    const traveledDistanceMeters = nonNegative(command.traveledDistanceMeters, "traveledDistanceMeters");
    const distanceThresholdMeters = positive(command.distanceThresholdMeters, "distanceThresholdMeters");
    if (traveledDistanceMeters >= distanceThresholdMeters) throw new AlertEventValidationError("traveledDistanceMeters");
    return Object.freeze({ type: command.type, vehicleId: vehicleId(command.vehicleId), observedAt: observedAt(command.observedAt), traveledDistanceMeters, distanceThresholdMeters, durationThresholdMinutes: positiveInteger(command.durationThresholdMinutes, "durationThresholdMinutes") });
  }
  throw new AlertEventValidationError("type");
}

export function validateUpdateAlertEventCommand(command: UpdateAlertEventCommand): UpdateAlertEventCommand {
  if (command.type === "SPEEDING") {
    rejectKeys(command, ["traveledDistanceMeters"]);
    return Object.freeze({ type: command.type, vehicleId: vehicleId(command.vehicleId), observedAt: observedAt(command.observedAt), speedKph: nonNegative(command.speedKph, "speedKph") });
  }
  if (command.type === "INACTIVITY") {
    rejectKeys(command, ["speedKph"]);
    return Object.freeze({ type: command.type, vehicleId: vehicleId(command.vehicleId), observedAt: observedAt(command.observedAt), traveledDistanceMeters: nonNegative(command.traveledDistanceMeters, "traveledDistanceMeters") });
  }
  throw new AlertEventValidationError("type");
}

export function validateResolveAlertEventCommand(command: ResolveAlertEventCommand): ResolveAlertEventCommand {
  return validateUpdateAlertEventCommand(command);
}
