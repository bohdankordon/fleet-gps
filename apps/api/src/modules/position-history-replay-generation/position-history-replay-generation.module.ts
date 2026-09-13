import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { POSITION_HISTORY_REPLAY_REPOSITORY } from "./position-history-replay-generation.tokens";
import { PositionHistoryReplayRunStateService } from "./position-history-replay-run-state.service";
import { PrismaPositionHistoryReplayRepository } from "./prisma-position-history-replay.repository";

@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: POSITION_HISTORY_REPLAY_REPOSITORY, useExisting: PrismaPositionHistoryReplayRepository },
    PrismaPositionHistoryReplayRepository,
    PositionHistoryReplayRunStateService,
  ],
  exports: [POSITION_HISTORY_REPLAY_REPOSITORY, PositionHistoryReplayRunStateService],
})
export class PositionHistoryReplayGenerationModule {}
