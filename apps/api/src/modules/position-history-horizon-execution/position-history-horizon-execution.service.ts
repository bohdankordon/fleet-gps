import { Injectable } from "@nestjs/common";
import { PositionHistoryHorizonExecutionRunnerService } from "./position-history-horizon-execution-runner.service";
import { toPositionHistoryHorizonExecutionResponse, type PositionHistoryHorizonExecutionRequest, type PositionHistoryHorizonExecutionResponse } from "./position-history-horizon-execution.types";

@Injectable()
export class PositionHistoryHorizonExecutionService {
  public constructor(private readonly runner: PositionHistoryHorizonExecutionRunnerService) {}

  public async run(request: PositionHistoryHorizonExecutionRequest): Promise<PositionHistoryHorizonExecutionResponse> {
    return toPositionHistoryHorizonExecutionResponse(
      request,
      await this.runner.run(request.to, { maxWindows: request.maxWindows, excludeProviderDisabled: request.excludeProviderDisabled }),
    );
  }
}
