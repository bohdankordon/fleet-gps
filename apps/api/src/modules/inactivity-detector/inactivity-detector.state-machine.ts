import { Injectable } from "@nestjs/common";
import { haversineDistanceMeters } from "./haversine-distance";
import type { InactivityDetectionResult, InactivityDetectorReason, InactivityObservationInput, InactivityRuleContext, NormalizedInactivityObservation } from "./inactivity-detector.types";
import { normalizeInactivityObservation, safeObservedAt, safeVehicleId } from "./inactivity-detector.validation";

type StoredContext = Readonly<{ distanceThresholdMeters: number; durationThresholdMinutes: number }>;
type VehicleState = { lastAcceptedObservedAtMs: number; history: NormalizedInactivityObservation[]; active: boolean; context: StoredContext };

function sameContext(left: StoredContext, right: StoredContext): boolean {
  return left.distanceThresholdMeters === right.distanceThresholdMeters && left.durationThresholdMinutes === right.durationThresholdMinutes;
}

@Injectable()
export class InactivityDetectorStateMachine {
  private readonly states = new Map<string, VehicleState>();

  public detect(input: InactivityObservationInput, context: InactivityRuleContext): InactivityDetectionResult {
    const observation = normalizeInactivityObservation(input);
    if (observation === null) return this.invalidResult(input);
    return this.detectNormalized(observation, context);
  }

  public invalidResult(input: InactivityObservationInput): InactivityDetectionResult {
    return this.result(safeVehicleId(input.vehicleId), safeObservedAt(input.observedAt), "IGNORED", "INVALID_OBSERVATION", null, null, null, null, 0, false);
  }

  public resetVehicle(vehicleId: string): void { this.states.delete(vehicleId); }
  public clearAll(): void { this.states.clear(); }
  public stateCount(): number { return this.states.size; }

  private detectNormalized(observation: NormalizedInactivityObservation, rule: InactivityRuleContext): InactivityDetectionResult {
    const previous = this.states.get(observation.vehicleId);
    const context: StoredContext = { distanceThresholdMeters: rule.distanceThresholdMeters, durationThresholdMinutes: rule.durationThresholdMinutes };

    // Disabling deliberately drops both timestamp and history. A later enable starts fresh.
    if (!rule.ruleEnabled) {
      this.states.delete(observation.vehicleId);
      return this.result(observation.vehicleId, observation.observedAt, "IGNORED", "RULE_DISABLED", null, null, context.distanceThresholdMeters, context.durationThresholdMinutes, 0, false);
    }

    if (previous !== undefined && observation.observedAtMs <= previous.lastAcceptedObservedAtMs) {
      return this.result(observation.vehicleId, observation.observedAt, "IGNORED", "OUT_OF_ORDER", null, null, context.distanceThresholdMeters, context.durationThresholdMinutes, previous.history.length, false);
    }

    if (previous === undefined) return this.startWindow(observation, context, "WINDOW_STARTED");
    if (!sameContext(previous.context, context)) return this.startWindow(observation, context, "RULE_CONTEXT_CHANGED");

    const durationMs = context.durationThresholdMinutes * 60_000;
    if (observation.observedAtMs - previous.lastAcceptedObservedAtMs >= durationMs) {
      return this.startWindow(observation, context, "DATA_GAP");
    }

    const history = [...previous.history, observation];
    const cutoffMs = observation.observedAtMs - durationMs;
    const trimmedHistory = this.trimHistory(history, cutoffMs);
    const state: VehicleState = { lastAcceptedObservedAtMs: observation.observedAtMs, history: trimmedHistory, active: previous.active, context };
    this.states.set(observation.vehicleId, state);
    const firstWindowPoint = trimmedHistory[0]!;
    const elapsedMinutes = (observation.observedAtMs - Math.max(firstWindowPoint.observedAtMs, cutoffMs)) / 60_000;
    if (firstWindowPoint.observedAtMs > cutoffMs) {
      return this.result(observation.vehicleId, observation.observedAt, "COLLECTING", "WINDOW_INCOMPLETE", elapsedMinutes, null, context.distanceThresholdMeters, context.durationThresholdMinutes, trimmedHistory.length, false);
    }

    const traveledDistanceMeters = this.cumulativeDistance(trimmedHistory, cutoffMs);
    if (traveledDistanceMeters >= context.distanceThresholdMeters) {
      state.active = false;
      return this.result(observation.vehicleId, observation.observedAt, "CLEAR", "DISTANCE_THRESHOLD_REACHED", elapsedMinutes, traveledDistanceMeters, context.distanceThresholdMeters, context.durationThresholdMinutes, trimmedHistory.length, false);
    }
    if (!state.active) {
      state.active = true;
      return this.result(observation.vehicleId, observation.observedAt, "CONFIRMED", "INACTIVITY_CONFIRMED", elapsedMinutes, traveledDistanceMeters, context.distanceThresholdMeters, context.durationThresholdMinutes, trimmedHistory.length, true);
    }
    return this.result(observation.vehicleId, observation.observedAt, "ACTIVE", "INACTIVITY_ACTIVE", elapsedMinutes, traveledDistanceMeters, context.distanceThresholdMeters, context.durationThresholdMinutes, trimmedHistory.length, false);
  }

  private startWindow(observation: NormalizedInactivityObservation, context: StoredContext, reason: "WINDOW_STARTED" | "RULE_CONTEXT_CHANGED" | "DATA_GAP"): InactivityDetectionResult {
    this.states.set(observation.vehicleId, { lastAcceptedObservedAtMs: observation.observedAtMs, history: [observation], active: false, context });
    return this.result(observation.vehicleId, observation.observedAt, "COLLECTING", reason, 0, null, context.distanceThresholdMeters, context.durationThresholdMinutes, 1, false);
  }

  /** Keeps one pre-cutoff anchor only when it is needed to clip a crossing segment. */
  private trimHistory(history: NormalizedInactivityObservation[], cutoffMs: number): NormalizedInactivityObservation[] {
    const firstAfterCutoff = history.findIndex((point) => point.observedAtMs >= cutoffMs);
    if (firstAfterCutoff === -1) return [history.at(-1)!];
    if (firstAfterCutoff === 0) return history;
    if (history[firstAfterCutoff]!.observedAtMs === cutoffMs) return history.slice(firstAfterCutoff);
    return history.slice(firstAfterCutoff - 1);
  }

  /** Sums full in-window segments and the time-proportional tail of one crossing segment. */
  private cumulativeDistance(history: readonly NormalizedInactivityObservation[], cutoffMs: number): number {
    let total = 0;
    for (let index = 1; index < history.length; index += 1) {
      const from = history[index - 1]!;
      const to = history[index]!;
      if (to.observedAtMs <= cutoffMs) continue;
      const segmentDistance = haversineDistanceMeters(from, to);
      if (from.observedAtMs >= cutoffMs) {
        total += segmentDistance;
        continue;
      }
      const insideFraction = (to.observedAtMs - cutoffMs) / (to.observedAtMs - from.observedAtMs);
      total += segmentDistance * insideFraction;
    }
    return Number.isFinite(total) && total >= 0 ? total : 0;
  }

  private result(vehicleId: string, observedAt: string | null, status: InactivityDetectionResult["status"], reason: InactivityDetectorReason, elapsedMinutes: number | null, traveledDistanceMeters: number | null, distanceThresholdMeters: number | null, durationThresholdMinutes: number | null, windowPointCount: number, newlyConfirmed: boolean): InactivityDetectionResult {
    return Object.freeze({ vehicleId, observedAt, status, reason, elapsedMinutes, traveledDistanceMeters, distanceThresholdMeters, durationThresholdMinutes, windowPointCount, newlyConfirmed });
  }
}
