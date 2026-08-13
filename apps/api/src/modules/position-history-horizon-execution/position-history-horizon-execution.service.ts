import { Injectable } from "@nestjs/common";
import { AuditEventRepository, buildShortPopulationExecutedAuditEvent, type AuditUserActor } from "../audit";
import { PositionHistoryHorizonExecutionRunnerService } from "./position-history-horizon-execution-runner.service";
import { toPositionHistoryHorizonExecutionResponse, type PositionHistoryHorizonExecutionRequest, type PositionHistoryHorizonExecutionResponse } from "./position-history-horizon-execution.types";

export class PositionHistoryHorizonExecutionFinalizationError extends Error {
  public constructor() {
    super("Position-history population finalization failed");
    this.name = "PositionHistoryHorizonExecutionFinalizationError";
  }
}

@Injectable()
export class PositionHistoryHorizonExecutionService {
  public constructor(private readonly runner: PositionHistoryHorizonExecutionRunnerService, private readonly audit: AuditEventRepository) {}

  public async run(request: PositionHistoryHorizonExecutionRequest, actor: AuditUserActor): Promise<PositionHistoryHorizonExecutionResponse> {
    const response = toPositionHistoryHorizonExecutionResponse(
      request,
      await this.runner.run(request.to, { maxWindows: request.maxWindows, excludeProviderDisabled: request.excludeProviderDisabled }),
    );
    if (response.committedWindows > 0) {
      const auditEvent = buildShortPopulationExecutedAuditEvent(actor, {
        to: response.to,
        windowBudget: response.maxWindows,
        excludeProviderDisabled: response.excludeProviderDisabled,
        committedWindows: response.committedWindows,
      });
      try {
        await this.audit.appendWithDatabase(auditEvent);
      } catch {
        throw new PositionHistoryHorizonExecutionFinalizationError();
      }
    }
    return response;
  }
}
