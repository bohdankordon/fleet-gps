import { Inject, Injectable } from "@nestjs/common";
import { positionHistoryPolicyFloor } from "../position-history-horizon/position-history-policy-floor";
import { POSITION_HISTORY_INGESTION_CURSOR_REPOSITORY } from "./position-history-ingestion-cursor.tokens";
import type { PersistContiguousHistoryResult, PersistContiguousHistoryResultInput, PositionHistoryIngestionCursorRepository, VehicleHistoryIngestionCursor } from "./position-history-ingestion-cursor.types";

@Injectable()
export class PositionHistoryIngestionCursorService {
  public constructor(@Inject(POSITION_HISTORY_INGESTION_CURSOR_REPOSITORY) private readonly repository: PositionHistoryIngestionCursorRepository) {}

  public ensureCursor(vehicleId: string, now: Date = new Date()): Promise<VehicleHistoryIngestionCursor> {
    return this.repository.ensureCursor(vehicleId, positionHistoryPolicyFloor(now));
  }

  public findCursor(vehicleId: string): Promise<VehicleHistoryIngestionCursor | null> {
    return this.repository.findCursor(vehicleId);
  }

  public persistContiguousResult(input: PersistContiguousHistoryResultInput): Promise<PersistContiguousHistoryResult> {
    return this.repository.persistContiguousResult(input);
  }
}
