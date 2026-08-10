import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { EquGpsModule } from "../equgps/equgps.module";
import { PositionHistoryBackfillService } from "./position-history-backfill.service";
import { POSITION_HISTORY_BACKFILL_CLOCK, POSITION_HISTORY_BACKFILL_REPOSITORY, POSITION_HISTORY_BACKFILL_SLEEPER } from "./position-history-backfill.tokens";
import type { PositionHistoryBackfillClock, PositionHistoryBackfillSleeper } from "./position-history-backfill.types";
import { PrismaPositionHistoryBackfillRepository } from "./prisma-position-history-backfill.repository";

@Module({
  imports: [DatabaseModule, EquGpsModule],
  providers: [
    { provide: POSITION_HISTORY_BACKFILL_REPOSITORY, useExisting: PrismaPositionHistoryBackfillRepository },
    { provide: POSITION_HISTORY_BACKFILL_CLOCK, useValue: { now: (): Date => new Date() } satisfies PositionHistoryBackfillClock },
    { provide: POSITION_HISTORY_BACKFILL_SLEEPER, useValue: { sleep: (durationMs: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, durationMs)) } satisfies PositionHistoryBackfillSleeper },
    PrismaPositionHistoryBackfillRepository,
    PositionHistoryBackfillService,
  ],
  exports: [PositionHistoryBackfillService],
})
export class PositionHistoryBackfillModule {}
