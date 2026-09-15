import { Injectable } from "@nestjs/common";
import type { NormalizedSpeedingObservation, SpeedingDetectionResult, SpeedingDetectorReason, SpeedingObservationInput, SpeedingRuleContext } from "./speeding-detector.types";
import { normalizeSpeedingObservation, safeObservedAt, safeVehicleId } from "./speeding-detector.validation";

type StoredContext = Readonly<{ zone: "CITY" | "OUTSIDE_CITY"; thresholdKph: number; confirmationRequired: number }>;
type VehicleState = { lastAcceptedObservedAtMs: number; consecutiveCount: number; confirmed: boolean; context: StoredContext | null };

function sameContext(left: StoredContext | null, right: StoredContext): boolean {
  return left !== null && left.zone === right.zone && left.thresholdKph === right.thresholdKph && left.confirmationRequired === right.confirmationRequired;
}

@Injectable()
export class SpeedingDetectorStateMachine {
  private readonly states = new Map<string, VehicleState>();

  public detect(input: SpeedingObservationInput, context: SpeedingRuleContext): SpeedingDetectionResult {
    const observation = normalizeSpeedingObservation(input);
    if (observation === null) return this.invalidResult(input);
    return this.detectNormalized(observation, context);
  }

  public invalidResult(input: SpeedingObservationInput): SpeedingDetectionResult {
    return this.result(safeVehicleId(input.vehicleId), safeObservedAt(input.observedAt), "IGNORED", "INVALID_OBSERVATION", "UNKNOWN", typeof input.speedKph === "number" && Number.isFinite(input.speedKph) ? input.speedKph : null, null, 0, 0, false);
  }

  public resetVehicle(vehicleId: string): void {
    this.states.delete(vehicleId);
  }

  public clearAll(): void {
    this.states.clear();
  }

  public stateCount(): number {
    return this.states.size;
  }

  private detectNormalized(observation: NormalizedSpeedingObservation, rule: SpeedingRuleContext): SpeedingDetectionResult {
    const previous = this.states.get(observation.vehicleId);
    if (previous !== undefined && observation.observedAtMs <= previous.lastAcceptedObservedAtMs) {
      return this.result(observation.vehicleId, observation.observedAt, "IGNORED", "OUT_OF_ORDER", rule.zone, observation.speedKph, rule.thresholdKph, previous.consecutiveCount, rule.confirmationRequired, false);
    }

    if (!rule.ruleEnabled) {
      this.states.set(observation.vehicleId, { lastAcceptedObservedAtMs: observation.observedAtMs, consecutiveCount: 0, confirmed: false, context: null });
      return this.result(observation.vehicleId, observation.observedAt, "IGNORED", "RULE_DISABLED", rule.zone, observation.speedKph, rule.thresholdKph, 0, rule.confirmationRequired, false);
    }

    if (rule.zone === "UNKNOWN" || rule.thresholdKph === null) {
      // A valid unknown-zone update is accepted for ordering, but cannot bridge
      // two known rule contexts into one speeding episode.
      this.states.set(observation.vehicleId, { lastAcceptedObservedAtMs: observation.observedAtMs, consecutiveCount: 0, confirmed: false, context: null });
      return this.result(observation.vehicleId, observation.observedAt, "IGNORED", "UNKNOWN_ZONE", "UNKNOWN", observation.speedKph, null, 0, rule.confirmationRequired, false);
    }

    const currentContext: StoredContext = { zone: rule.zone, thresholdKph: rule.thresholdKph, confirmationRequired: rule.confirmationRequired };
    const contextChanged = previous?.context !== null && previous !== undefined && !sameContext(previous.context, currentContext);
    if (observation.speedKph <= rule.thresholdKph) {
      this.states.set(observation.vehicleId, { lastAcceptedObservedAtMs: observation.observedAtMs, consecutiveCount: 0, confirmed: false, context: currentContext });
      return this.result(observation.vehicleId, observation.observedAt, "CLEAR", "BELOW_OR_EQUAL_THRESHOLD", rule.zone, observation.speedKph, rule.thresholdKph, 0, rule.confirmationRequired, false);
    }

    const continuing = previous !== undefined && sameContext(previous.context, currentContext);
    const consecutiveCount = continuing ? previous.consecutiveCount + 1 : 1;
    const newlyConfirmed = (!continuing || !previous.confirmed) && consecutiveCount >= rule.confirmationRequired;
    const confirmed = (continuing && previous.confirmed) || newlyConfirmed;
    this.states.set(observation.vehicleId, { lastAcceptedObservedAtMs: observation.observedAtMs, consecutiveCount, confirmed, context: currentContext });
    const status = newlyConfirmed ? "CONFIRMED" : confirmed ? "ACTIVE" : "PENDING";
    return this.result(observation.vehicleId, observation.observedAt, status, contextChanged ? "RULE_CONTEXT_CHANGED" : "ABOVE_THRESHOLD", rule.zone, observation.speedKph, rule.thresholdKph, consecutiveCount, rule.confirmationRequired, newlyConfirmed, newlyConfirmed ? { latitude: observation.latitude, longitude: observation.longitude } : undefined);
  }

  private result(vehicleId: string, observedAt: string | null, status: SpeedingDetectionResult["status"], reason: SpeedingDetectorReason, zone: SpeedingDetectionResult["zone"], speedKph: number | null, thresholdKph: number | null, consecutiveCount: number, confirmationRequired: number, newlyConfirmed: boolean, confirmationPosition?: Readonly<{ latitude: number; longitude: number }>): SpeedingDetectionResult {
    return Object.freeze({ vehicleId, observedAt, status, reason, zone, speedKph, thresholdKph, consecutiveCount, confirmationRequired, newlyConfirmed, ...(confirmationPosition ? { confirmationPosition: Object.freeze(confirmationPosition) } : {}) });
  }
}
