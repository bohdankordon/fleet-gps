import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PositionHistoryIngestionCursorService } from "./position-history-ingestion-cursor.service";
import { POSITION_HISTORY_INGESTION_CURSOR_REPOSITORY } from "./position-history-ingestion-cursor.tokens";
import { PrismaPositionHistoryIngestionCursorRepository } from "./prisma-position-history-ingestion-cursor.repository";

@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: POSITION_HISTORY_INGESTION_CURSOR_REPOSITORY, useExisting: PrismaPositionHistoryIngestionCursorRepository },
    PrismaPositionHistoryIngestionCursorRepository,
    PositionHistoryIngestionCursorService,
  ],
  exports: [PositionHistoryIngestionCursorService],
})
export class PositionHistoryIngestionCursorModule {}
