import type { PositionHistoryHorizonPopulationProgress } from "./position-history-horizon-population.types";

export class PositionHistoryHorizonPopulationError extends Error {
  public override readonly name = "PositionHistoryHorizonPopulationError";
  public constructor(public readonly progress: PositionHistoryHorizonPopulationProgress, public readonly underlyingError: unknown) {
    super("Position history horizon population failed");
  }
}
