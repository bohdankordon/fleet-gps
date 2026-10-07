import { PositionHistoryReplayKind } from "../../generated/prisma/client";
import { partitionPositionHistoryHorizon } from "../position-history-horizon/position-history-horizon-partition";
import { POSITION_HISTORY_ABSOLUTE_DAY_MS } from "../position-history-horizon/position-history-horizon.policy";
import { canonicalPositionHistoryMaintenanceAnchor } from "../position-history-population-runs/position-history-maintenance-anchor";
import type { EnsurePositionHistoryReplayCheckpointInput, PositionHistoryReplayVehicle } from "../position-history-replay-generation";
import { POSITION_HISTORY_ADAPTIVE_FETCH_DURATIONS_MS, POSITION_HISTORY_REPLAY_DAILY_DAYS, POSITION_HISTORY_REPLAY_OVERSIZED_FALLBACK_FLOOR_WINDOW_MS, POSITION_HISTORY_REPLAY_ROLLING_DAYS, POSITION_HISTORY_REPLAY_TIMEOUT_RECOVERY_MAX_TIER, POSITION_HISTORY_REPLAY_TIMEOUT_RECOVERY_WINDOWS_MS } from "./position-history-replay-orchestration.constants";
import type { PositionHistoryReplayTarget } from "./position-history-replay-orchestration.types";

const DAILY_ANCHOR_UTC_HOUR = 2;

export function canonicalDailyPositionHistoryReplayAnchor(safeNow: Date): Date {
  if (!(safeNow instanceof Date) || !Number.isFinite(safeNow.getTime())) throw new Error("Invalid daily replay anchor instant.");
  const anchor = new Date(Date.UTC(safeNow.getUTCFullYear(), safeNow.getUTCMonth(), safeNow.getUTCDate(), DAILY_ANCHOR_UTC_HOUR));
  if (anchor > safeNow) anchor.setUTCDate(anchor.getUTCDate() - 1);
  return anchor;
}

export function positionHistoryReplayTarget(kind: PositionHistoryReplayKind, safeNow: Date): PositionHistoryReplayTarget {
  const generationAnchor = kind === PositionHistoryReplayKind.DAILY_7_DAY
    ? canonicalDailyPositionHistoryReplayAnchor(safeNow)
    : canonicalPositionHistoryMaintenanceAnchor(safeNow);
  const days = kind === PositionHistoryReplayKind.DAILY_7_DAY ? POSITION_HISTORY_REPLAY_DAILY_DAYS : POSITION_HISTORY_REPLAY_ROLLING_DAYS;
  return Object.freeze({ kind, generationAnchor, rangeFrom: new Date(generationAnchor.getTime() - days * POSITION_HISTORY_ABSOLUTE_DAY_MS), rangeTo: new Date(generationAnchor.getTime()) });
}

export function positionHistoryReplayCheckpoints(target: Pick<PositionHistoryReplayTarget, "kind" | "rangeFrom" | "rangeTo">, vehicles: readonly PositionHistoryReplayVehicle[]): readonly EnsurePositionHistoryReplayCheckpointInput[] {
  const slices = target.kind === PositionHistoryReplayKind.DAILY_7_DAY
    ? [{ from: target.rangeFrom, to: target.rangeTo }]
    : partitionPositionHistoryHorizon(target.rangeTo, POSITION_HISTORY_REPLAY_ROLLING_DAYS);
  return Object.freeze(vehicles.flatMap((vehicle) => slices.map((slice) => Object.freeze({ vehicleId: vehicle.vehicleId, rangeFrom: new Date(slice.from.getTime()), rangeTo: new Date(slice.to.getTime()) }))));
}

export function positionHistoryReplayAdaptiveWindowEnds(nextFrom: Date, rangeTo: Date): readonly Date[] {
  const start = nextFrom.getTime();
  const end = rangeTo.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error("Invalid replay adaptive range.");
  const ends: Date[] = [];
  let previous = -1;
  for (const duration of POSITION_HISTORY_ADAPTIVE_FETCH_DURATIONS_MS) {
    const candidate = Math.min(start + duration, end);
    if (candidate === previous) continue;
    ends.push(new Date(candidate));
    previous = candidate;
  }
  return Object.freeze(ends);
}

export function clampPositionHistoryReplayTimeoutTier(tier: number): number {
  if (!Number.isFinite(tier)) return 0;
  return Math.min(POSITION_HISTORY_REPLAY_TIMEOUT_RECOVERY_MAX_TIER, Math.max(0, Math.trunc(tier)));
}

export function positionHistoryReplayTimeoutWindowMs(tier: number): number {
  return POSITION_HISTORY_REPLAY_TIMEOUT_RECOVERY_WINDOWS_MS[clampPositionHistoryReplayTimeoutTier(tier)]!;
}

export function nextPositionHistoryReplayTimeoutTier(tier: number): number {
  return clampPositionHistoryReplayTimeoutTier(clampPositionHistoryReplayTimeoutTier(tier) + 1);
}

export function positionHistoryReplayTimeoutRecoveryKey(input: Readonly<{ vehicleId: string; rangeFrom: Date; rangeTo: Date; nextFrom: Date }>): string {
  if (typeof input.vehicleId !== "string" || input.vehicleId.length === 0) throw new Error("Invalid replay timeout recovery key.");
  const rangeFrom = input.rangeFrom instanceof Date ? input.rangeFrom.getTime() : Number.NaN;
  const rangeTo = input.rangeTo instanceof Date ? input.rangeTo.getTime() : Number.NaN;
  const nextFrom = input.nextFrom instanceof Date ? input.nextFrom.getTime() : Number.NaN;
  if (!Number.isFinite(rangeFrom) || !Number.isFinite(rangeTo) || !Number.isFinite(nextFrom) || !(rangeFrom <= nextFrom && nextFrom < rangeTo)) throw new Error("Invalid replay timeout recovery key.");
  // Logical replay identity only: internal vehicle and checkpoint range facts.
  // Never provider device IDs, generation IDs, coordinates, or payload data.
  return input.vehicleId + "|" + String(rangeFrom) + "|" + String(rangeTo) + "|" + String(nextFrom);
}

export function positionHistoryReplayTimeoutWindowEnds(nextFrom: Date, rangeTo: Date, tier: number): readonly Date[] {
  const start = nextFrom instanceof Date ? nextFrom.getTime() : Number.NaN;
  const end = rangeTo instanceof Date ? rangeTo.getTime() : Number.NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error("Invalid replay timeout recovery range.");
  const maximumWindowMs = positionHistoryReplayTimeoutWindowMs(tier);
  // A sub-hour timeout quantum is a single maximum-window attempt. It is
  // never an oversized-response fallback: an oversized sub-hour response is
  // a hard safe failure exactly like an oversized one-hour response.
  if (maximumWindowMs < POSITION_HISTORY_REPLAY_OVERSIZED_FALLBACK_FLOOR_WINDOW_MS) {
    return Object.freeze([new Date(Math.min(start + maximumWindowMs, end))]);
  }
  // Wide quanta keep the established oversized subdivision contract
  // (6h -> 3h -> 1h) bounded by the timeout recovery maximum.
  return Object.freeze(positionHistoryReplayAdaptiveWindowEnds(nextFrom, rangeTo).filter((candidate) => candidate.getTime() - start <= maximumWindowMs));
}
