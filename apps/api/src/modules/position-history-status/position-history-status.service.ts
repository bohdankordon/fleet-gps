import { Inject, Injectable } from "@nestjs/common";
import { PositionHistoryHorizonService } from "../position-history-horizon/position-history-horizon.service";
import { POSITION_HISTORY_STATUS_OBSERVATION_REPOSITORY } from "./position-history-status.tokens";
import type { PositionHistoryStatusObservationRepository, PositionHistoryStatusResult } from "./position-history-status.types";

@Injectable()
export class PositionHistoryStatusService {
  public constructor(
    private readonly horizon: PositionHistoryHorizonService,
    @Inject(POSITION_HISTORY_STATUS_OBSERVATION_REPOSITORY) private readonly observations: PositionHistoryStatusObservationRepository,
  ) {}

  public async inspect(to: Date): Promise<PositionHistoryStatusResult> {
    const plan = await this.horizon.run(to);
    const observations = await this.observations.inspect(plan.horizon.from, plan.horizon.to);
    return Object.freeze({ plan, observations });
  }
}
