import { PositionHistoryReplayKind } from "../../generated/prisma/client";
import { partitionPositionHistoryHorizon } from "../position-history-horizon/position-history-horizon-partition";
import { POSITION_HISTORY_ABSOLUTE_DAY_MS } from "../position-history-horizon/position-history-horizon.policy";
import { canonicalPositionHistoryMaintenanceAnchor } from "../position-history-population-runs/position-history-maintenance-anchor";
import type { EnsurePositionHistoryReplayCheckpointInput, PositionHistoryReplayVehicle } from "../position-history-replay-generation";
import { POSITION_HISTORY_REPLAY_DAILY_DAYS, POSITION_HISTORY_REPLAY_ROLLING_DAYS } from "./position-history-replay-orchestration.constants";
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
