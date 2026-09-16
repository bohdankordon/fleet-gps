import type { InactivityDetectionResult } from "../inactivity-detector";
import type { SpeedingDetectionResult } from "../speeding-detector";
import type { AlertEventPersistenceAction } from "./alert-events.types";
import { validateOpenAlertEventCommand, validateResolveAlertEventCommand, validateUpdateAlertEventCommand } from "./alert-events.validation";

const NONE: AlertEventPersistenceAction = Object.freeze({ kind: "NONE" });

function date(value: string | null): Date {
  const parsed = typeof value === "string" ? new Date(value) : new Date(Number.NaN);
  return parsed;
}

export function mapSpeedingDetectionToAlertEventAction(result: SpeedingDetectionResult): AlertEventPersistenceAction {
  if (result.status === "CONFIRMED" && result.newlyConfirmed) {
    const command = validateOpenAlertEventCommand({ type: "SPEEDING", vehicleId: result.vehicleId, observedAt: date(result.observedAt), zone: result.zone as "CITY" | "OUTSIDE_CITY", speedKph: result.speedKph as number, speedThresholdKph: result.thresholdKph as number, confirmationLatitude: result.confirmationPosition?.latitude as number, confirmationLongitude: result.confirmationPosition?.longitude as number });
    return Object.freeze({ kind: "OPEN", command });
  }
  if (result.status === "ACTIVE") {
    const command = validateUpdateAlertEventCommand({ type: "SPEEDING", vehicleId: result.vehicleId, observedAt: date(result.observedAt), speedKph: result.speedKph as number });
    return Object.freeze({ kind: "UPDATE", command });
  }
  if (result.status === "CLEAR") {
    const command = validateResolveAlertEventCommand({ type: "SPEEDING", vehicleId: result.vehicleId, observedAt: date(result.observedAt), speedKph: result.speedKph as number });
    return Object.freeze({ kind: "RESOLVE", command });
  }
  return NONE;
}

export function mapInactivityDetectionToAlertEventAction(result: InactivityDetectionResult): AlertEventPersistenceAction {
  if (result.status === "CONFIRMED" && result.newlyConfirmed) {
    const command = validateOpenAlertEventCommand({ type: "INACTIVITY", vehicleId: result.vehicleId, observedAt: date(result.observedAt), traveledDistanceMeters: result.traveledDistanceMeters as number, distanceThresholdMeters: result.distanceThresholdMeters as number, durationThresholdMinutes: result.durationThresholdMinutes as number });
    return Object.freeze({ kind: "OPEN", command });
  }
  if (result.status === "ACTIVE") {
    const command = validateUpdateAlertEventCommand({ type: "INACTIVITY", vehicleId: result.vehicleId, observedAt: date(result.observedAt), traveledDistanceMeters: result.traveledDistanceMeters as number });
    return Object.freeze({ kind: "UPDATE", command });
  }
  if (result.status === "CLEAR") {
    const command = validateResolveAlertEventCommand({ type: "INACTIVITY", vehicleId: result.vehicleId, observedAt: date(result.observedAt), traveledDistanceMeters: result.traveledDistanceMeters as number });
    return Object.freeze({ kind: "RESOLVE", command });
  }
  return NONE;
}
