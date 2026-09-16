import { Injectable } from "@nestjs/common";
import type { NormalizedSpeedingObservation, SpeedingDetectionResult, SpeedingDetectorCheckpoint, SpeedingDetectorReason, SpeedingObservationInput, SpeedingRuleContext, SpeedingStreakStart } from "./speeding-detector.types";
import { normalizeSpeedingObservation, safeObservedAt, safeVehicleId } from "./speeding-detector.validation";

type StoredContext = Readonly<{ zone: "CITY" | "OUTSIDE_CITY"; thresholdKph: number; confirmationRequired: number; settingsFingerprint: string }>;
type VehicleState = { lastAcceptedObservedAtMs: number; settingsFingerprint: string; consecutiveCount: number; confirmed: boolean; context: StoredContext | null; streakStart: SpeedingStreakStart | null; confirmationObservedAt: string | null };

function sameContext(left: StoredContext | null, right: StoredContext): boolean {
  return left !== null && left.zone === right.zone && left.thresholdKph === right.thresholdKph && left.confirmationRequired === right.confirmationRequired && left.settingsFingerprint === right.settingsFingerprint;
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

  public invalidateContextsPreservingOrdering(): void {
    for (const [vehicleId, state] of this.states) {
      this.states.set(vehicleId, { ...state, consecutiveCount: 0, confirmed: false, context: null, streakStart: null, confirmationObservedAt: null });
    }
  }

  public seedOrderingFrontier(vehicleId: string, lastAcceptedObservedAt: Date, settingsFingerprint: string): void {
    this.states.set(vehicleId, { lastAcceptedObservedAtMs: lastAcceptedObservedAt.getTime(), settingsFingerprint, consecutiveCount: 0, confirmed: false, context: null, streakStart: null, confirmationObservedAt: null });
  }

  public hydrate(checkpoint: SpeedingDetectorCheckpoint): void {
    const context = checkpoint.context === null ? null : Object.freeze({ ...checkpoint.context, settingsFingerprint: checkpoint.settingsFingerprint });
    this.states.set(checkpoint.vehicleId, {
      lastAcceptedObservedAtMs: Date.parse(checkpoint.lastAcceptedObservedAt),
      settingsFingerprint: checkpoint.settingsFingerprint,
      consecutiveCount: checkpoint.consecutiveCount,
      confirmed: checkpoint.confirmed,
      context,
      streakStart: checkpoint.streakStart,
      confirmationObservedAt: checkpoint.confirmationObservedAt,
    });
  }

  public checkpoint(vehicleId: string): SpeedingDetectorCheckpoint | null {
    const state = this.states.get(vehicleId);
    if (state === undefined) return null;
    return Object.freeze({
      vehicleId,
      lastAcceptedObservedAt: new Date(state.lastAcceptedObservedAtMs).toISOString(),
      settingsFingerprint: state.settingsFingerprint,
      context: state.context === null ? null : Object.freeze({ zone: state.context.zone, thresholdKph: state.context.thresholdKph, confirmationRequired: state.context.confirmationRequired }),
      consecutiveCount: state.consecutiveCount,
      confirmed: state.confirmed,
      streakStart: state.streakStart,
      confirmationObservedAt: state.confirmationObservedAt,
    });
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
      this.states.set(observation.vehicleId, { lastAcceptedObservedAtMs: observation.observedAtMs, settingsFingerprint: rule.settingsFingerprint, consecutiveCount: 0, confirmed: false, context: null, streakStart: null, confirmationObservedAt: null });
      return this.result(observation.vehicleId, observation.observedAt, "IGNORED", "RULE_DISABLED", rule.zone, observation.speedKph, rule.thresholdKph, 0, rule.confirmationRequired, false);
    }

    if (rule.zone === "UNKNOWN" || rule.thresholdKph === null) {
      // A valid unknown-zone update is accepted for ordering, but cannot bridge
      // two known rule contexts into one speeding episode.
      this.states.set(observation.vehicleId, { lastAcceptedObservedAtMs: observation.observedAtMs, settingsFingerprint: rule.settingsFingerprint, consecutiveCount: 0, confirmed: false, context: null, streakStart: null, confirmationObservedAt: null });
      return this.result(observation.vehicleId, observation.observedAt, "IGNORED", "UNKNOWN_ZONE", "UNKNOWN", observation.speedKph, null, 0, rule.confirmationRequired, false);
    }

    const currentContext: StoredContext = { zone: rule.zone, thresholdKph: rule.thresholdKph, confirmationRequired: rule.confirmationRequired, settingsFingerprint: rule.settingsFingerprint };
    const contextChanged = previous?.context !== null && previous !== undefined && !sameContext(previous.context, currentContext);
    if (observation.speedKph <= rule.thresholdKph) {
      this.states.set(observation.vehicleId, { lastAcceptedObservedAtMs: observation.observedAtMs, settingsFingerprint: rule.settingsFingerprint, consecutiveCount: 0, confirmed: false, context: currentContext, streakStart: null, confirmationObservedAt: null });
      return this.result(observation.vehicleId, observation.observedAt, "CLEAR", "BELOW_OR_EQUAL_THRESHOLD", rule.zone, observation.speedKph, rule.thresholdKph, 0, rule.confirmationRequired, false);
    }

    const continuing = previous !== undefined && sameContext(previous.context, currentContext);
    const consecutiveCount = continuing ? previous.consecutiveCount + 1 : 1;
    const newlyConfirmed = (!continuing || !previous.confirmed) && consecutiveCount >= rule.confirmationRequired;
    const confirmed = (continuing && previous.confirmed) || newlyConfirmed;
    const streakStart = continuing && previous.streakStart !== null ? previous.streakStart : Object.freeze({ observedAt: observation.observedAt, latitude: observation.latitude, longitude: observation.longitude });
    const confirmationObservedAt = newlyConfirmed ? observation.observedAt : confirmed && continuing ? previous.confirmationObservedAt : null;
    this.states.set(observation.vehicleId, { lastAcceptedObservedAtMs: observation.observedAtMs, settingsFingerprint: rule.settingsFingerprint, consecutiveCount, confirmed, context: currentContext, streakStart, confirmationObservedAt });
    const status = newlyConfirmed ? "CONFIRMED" : confirmed ? "ACTIVE" : "PENDING";
    const position = { latitude: observation.latitude, longitude: observation.longitude };
    return this.result(observation.vehicleId, observation.observedAt, status, contextChanged ? "RULE_CONTEXT_CHANGED" : "ABOVE_THRESHOLD", rule.zone, observation.speedKph, rule.thresholdKph, consecutiveCount, rule.confirmationRequired, newlyConfirmed, newlyConfirmed ? position : undefined, confirmed ? confirmationObservedAt ?? undefined : undefined, newlyConfirmed ? streakStart : undefined, confirmed ? position : undefined);
  }

  private result(vehicleId: string, observedAt: string | null, status: SpeedingDetectionResult["status"], reason: SpeedingDetectorReason, zone: SpeedingDetectionResult["zone"], speedKph: number | null, thresholdKph: number | null, consecutiveCount: number, confirmationRequired: number, newlyConfirmed: boolean, confirmationPosition?: Readonly<{ latitude: number; longitude: number }>, confirmationObservedAt?: string, streakStart?: SpeedingStreakStart, speedingPosition?: Readonly<{ latitude: number; longitude: number }>): SpeedingDetectionResult {
    return Object.freeze({ vehicleId, observedAt, status, reason, zone, speedKph, thresholdKph, consecutiveCount, confirmationRequired, newlyConfirmed, ...(confirmationPosition ? { confirmationPosition: Object.freeze(confirmationPosition) } : {}), ...(confirmationObservedAt ? { confirmationObservedAt } : {}), ...(streakStart ? { streakStart } : {}), ...(speedingPosition ? { speedingPosition: Object.freeze(speedingPosition) } : {}) });
  }
}
